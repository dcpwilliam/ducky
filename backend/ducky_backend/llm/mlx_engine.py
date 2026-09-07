"""MLX engine — the preferred backend on Apple Silicon.

MLX is used instead of llama.cpp on M-series chips because the unified memory
architecture means model weights are not copied between system RAM and VRAM;
the GPU reads them in place. That removes both the copy cost and the need to
manually split layers across devices.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Iterator

from ducky_backend.llm.engine import (
    BaseEngine,
    EngineError,
    GenerateParams,
    ModelStatus,
    is_apple_silicon,
)

logger = logging.getLogger('ducky.llm.mlx')

# Models known to work well on 8-16GB unified memory, pre-converted to MLX.
RECOMMENDED_MODELS: list[dict[str, Any]] = [
    {
        'id': 'mlx-community/Qwen2.5-0.5B-Instruct-4bit',
        'name': 'Qwen2.5 0.5B Instruct (4-bit)',
        'paramsB': 0.5,
        'quant': '4bit',
        'sizeGb': 0.3,
        'note': 'Fastest. Good for tool-calling smoke tests.'
    },
    {
        'id': 'mlx-community/Qwen2.5-1.5B-Instruct-4bit',
        'name': 'Qwen2.5 1.5B Instruct (4-bit)',
        'paramsB': 1.5,
        'quant': '4bit',
        'sizeGb': 0.9,
        'note': 'Balanced default for agent debugging.'
    },
    {
        'id': 'mlx-community/Qwen2.5-3B-Instruct-4bit',
        'name': 'Qwen2.5 3B Instruct (4-bit)',
        'paramsB': 3.0,
        'quant': '4bit',
        'sizeGb': 1.8,
        'note': 'Better reasoning; needs ~4GB free memory.'
    },
    {
        'id': 'mlx-community/Qwen2.5-7B-Instruct-4bit',
        'name': 'Qwen2.5 7B Instruct (4-bit)',
        'paramsB': 7.0,
        'quant': '4bit',
        'sizeGb': 4.2,
        'note': 'Heaviest; only for 16GB+ machines.'
    },
    {
        'id': 'mlx-community/Llama-3.2-1B-Instruct-4bit',
        'name': 'Llama 3.2 1B Instruct (4-bit)',
        'paramsB': 1.2,
        'quant': '4bit',
        'sizeGb': 0.8,
        'note': 'English-strong alternative.'
    }
]


class MLXEngine(BaseEngine):
    name = 'mlx'

    def __init__(self) -> None:
        self._model: Any = None
        self._tokenizer: Any = None
        self._model_id: str | None = None
        self._status: ModelStatus | None = None
        # Serializes load/generate/unload: MLX graphs are not reentrant and
        # concurrent generation would corrupt the KV cache.
        self._lock = threading.RLock()

    @property
    def available(self) -> bool:
        if not is_apple_silicon():
            return False
        try:
            import mlx.core  # noqa: F401
            import mlx_lm  # noqa: F401
            return True
        except ImportError:
            return False

    # -- lifecycle ------------------------------------------------------

    def load(self, model_id: str, **opts: Any) -> ModelStatus:
        from mlx_lm import load as mlx_load

        with self._lock:
            if self._model_id == model_id and self._model is not None:
                return self._status  # type: ignore[return-value]

            # Free the previous model before allocating the next one;
            # unified memory means both would otherwise be resident.
            if self._model is not None:
                self._release()

            logger.info('Loading model %s via MLX', model_id)
            try:
                model, tokenizer = mlx_load(model_id, tokenizer_config=opts.get(
                    'tokenizer_config', {'trust_remote_code': True}
                ))
            except TypeError:
                # Older mlx-lm releases reject tokenizer_config.
                model, tokenizer = mlx_load(model_id)
            except Exception as exc:
                raise EngineError(
                    f'Failed to load "{model_id}". If this is the first run the '
                    f'weights are downloading from HuggingFace — check your '
                    f'network or set HF_ENDPOINT. Original error: {exc}'
                ) from exc

            self._model = model
            self._tokenizer = tokenizer
            self._model_id = model_id

            self._status = ModelStatus(
                model_id=model_id,
                backend='mlx',
                device='apple-silicon-gpu',
                params_b=self._infer_params(model),
                quant=self._infer_quant(model_id),
                memory_gb=self.active_memory_gb(),
                context_tokens=self._infer_context(tokenizer)
            )
            logger.info('Model %s loaded', model_id)
            return self._status

    def unload(self) -> None:
        with self._lock:
            self._release()

    def _release(self) -> None:
        self._model = None
        self._tokenizer = None
        self._model_id = None
        self._status = None
        try:
            import mlx.core as mx
            clear = getattr(mx, 'clear_cache', None)
            if clear is None:
                metal = getattr(mx, 'metal', None)
                clear = getattr(metal, 'clear_cache', None) if metal else None
            if clear is not None:
                clear()
        except Exception:
            pass

    # -- generation -----------------------------------------------------

    def generate(self, prompt: str, params: GenerateParams) -> Iterator[str]:
        """Stream text chunks. Blocks; caller must run this off the event loop."""
        from mlx_lm import stream_generate
        from mlx_lm.sample_utils import make_sampler
        import mlx.core as mx

        with self._lock:
            if self._model is None:
                raise EngineError('No model loaded')

            model = self._model
            tokenizer = self._tokenizer

        # Reproducible runs: mlx-lm consumes the seed via the global PRNG, not a
        # generate_step kwarg.
        if params.seed is not None:
            try:
                mx.random.seed(int(params.seed))
            except Exception:
                pass

        # mlx-lm 0.31+ passes sampling config as a single `sampler` callable.
        # Temperature 0 → greedy (argmax). top_p/min_p/top_k are folded in.
        sampler = make_sampler(
            temp=params.temperature if params.temperature > 0 else 0.0,
            top_p=params.top_p,
            min_p=0.0,
            top_k=0,
        )

        kwargs: dict[str, Any] = {
            'max_tokens': params.max_tokens,
            'sampler': sampler,
        }

        # Repetition penalty is no longer a flat kwarg; express it as a logits
        # processor over the recent context window.
        if params.repetition_penalty and params.repetition_penalty != 1.0:
            pen = float(params.repetition_penalty)

            def _repetition(tokens, logits):  # noqa: ANN001
                ctx = tokens[-64:]
                for t in set(ctx.tolist()):
                    logits[t] = logits[t] / pen if pen > 1.0 else logits[t] * pen
                return logits

            kwargs['logits_processors'] = [_repetition]

        # Carry state across chunks so stop sequences spanning chunk
        # boundaries are still detected.
        pending = ''
        emitted = 0

        try:
            for chunk in stream_generate(model, tokenizer, prompt, **kwargs):
                text = getattr(chunk, 'text', None)
                if text is None:
                    text = str(chunk)
                if not text:
                    continue

                pending += text
                trimmed, stopped = self.apply_stop(pending, params.stop)
                if trimmed:
                    if len(trimmed) > emitted:
                        yield trimmed[emitted:]
                        emitted = len(trimmed)
                if stopped:
                    return
                if len(pending) > emitted + 16:
                    # Enough buffered that no stop string can still match.
                    yield pending[emitted:]
                    emitted = len(pending)

            if len(pending) > emitted:
                yield pending[emitted:]
        except Exception as exc:
            raise EngineError(f'Generation failed: {exc}') from exc

    def tokenize(self, text: str) -> list[int]:
        with self._lock:
            if self._tokenizer is None:
                raise EngineError('No model loaded')
            return list(self._tokenizer.encode(text))

    def status(self) -> ModelStatus | None:
        return self._status

    # -- helpers --------------------------------------------------------

    def apply_chat_template(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]] | None = None
    ) -> str:
        """Render chat messages into the model's native prompt format."""
        with self._lock:
            if self._tokenizer is None:
                raise EngineError('No model loaded')
            tokenizer = self._tokenizer

        if not hasattr(tokenizer, 'apply_chat_template'):
            return self._fallback_template(messages)

        try:
            return tokenizer.apply_chat_template(
                messages,
                tools=tools,
                add_generation_prompt=True,
                tokenize=False
            )
        except TypeError:
            # Template does not support the tools argument.
            try:
                return tokenizer.apply_chat_template(
                    messages, add_generation_prompt=True, tokenize=False
                )
            except Exception:
                return self._fallback_template(messages)
        except Exception as exc:
            logger.warning('Chat template failed (%s), using fallback', exc)
            return self._fallback_template(messages)

    @staticmethod
    def _fallback_template(messages: list[dict[str, str]]) -> str:
        parts: list[str] = []
        for m in messages:
            role = m.get('role', 'user')
            parts.append(f'<|im_start|>{role}\n{m.get("content", "")}<|im_end|>')
        parts.append('<|im_start|>assistant\n')
        return '\n'.join(parts)

    @staticmethod
    def _memory(kind: str) -> float | None:
        """Query Metal memory usage across mlx API generations.

        Recent mlx exposes ``mx.get_active_memory``; older releases only have
        the ``mx.metal`` namespace. Try both before giving up.
        """
        try:
            import mlx.core as mx
            getter = getattr(mx, f'get_{kind}_memory', None)
            if getter is None:
                metal = getattr(mx, 'metal', None)
                getter = getattr(metal, f'get_{kind}_memory', None) if metal else None
            if getter is None:
                return None
            return round(getter() / (1024 ** 3), 2)
        except Exception:
            return None

    def active_memory_gb(self) -> float | None:
        return self._memory('active')

    def peak_memory_gb(self) -> float | None:
        return self._memory('peak')

    @staticmethod
    def _infer_params(model: Any) -> float | None:
        try:
            total = 0
            for _, value in model.parameters().items():
                total += value.size
            return round(total / 1e9, 3)
        except Exception:
            return None

    @staticmethod
    def _infer_quant(model_id: str) -> str | None:
        lowered = model_id.lower()
        for tag in ('8bit', '6bit', '5bit', '4bit', '3bit', '2bit', 'bf16', 'fp16'):
            if tag in lowered:
                return tag
        return None

    @staticmethod
    def _infer_context(tokenizer: Any) -> int | None:
        for attr in ('model_max_length',):
            value = getattr(tokenizer, attr, None)
            if isinstance(value, int) and 0 < value < 1_000_000:
                return value
        return 4096


def recommended_models() -> list[dict[str, Any]]:
    return RECOMMENDED_MODELS
