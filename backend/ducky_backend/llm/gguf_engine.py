"""llama.cpp engine — fallback backend for non-Apple-Silicon machines.

Unlike MLX there is no unified memory here, so the useful knob is
``n_gpu_layers``: it decides how many transformer layers are offloaded to the
GPU versus staying on CPU. ``-1`` offloads everything (fast, needs enough VRAM)
and ``0`` runs entirely on CPU (slow but always works).
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Iterator

from ducky_backend.llm.engine import BaseEngine, EngineError, GenerateParams, ModelStatus

logger = logging.getLogger('ducky.llm.gguf')


class GGUFEngine(BaseEngine):
    name = 'llamacpp'

    def __init__(self) -> None:
        self._llm: Any = None
        self._model_id: str | None = None
        self._status: ModelStatus | None = None
        self._lock = threading.RLock()

    @property
    def available(self) -> bool:
        try:
            import llama_cpp  # noqa: F401
            return True
        except ImportError:
            return False

    def load(self, model_id: str, **opts: Any) -> ModelStatus:
        from llama_cpp import Llama

        with self._lock:
            if self._model_id == model_id and self._llm is not None:
                return self._status  # type: ignore[return-value]

            if self._llm is not None:
                self._release()

            n_gpu_layers = int(opts.get('n_gpu_layers', -1))
            n_ctx = int(opts.get('n_ctx', 4096))

            logger.info('Loading GGUF %s (gpu_layers=%s, ctx=%s)',
                        model_id, n_gpu_layers, n_ctx)
            try:
                self._llm = Llama(
                    model_path=model_id,
                    n_ctx=n_ctx,
                    n_gpu_layers=n_gpu_layers,
                    verbose=False
                )
            except Exception as exc:
                raise EngineError(f'Failed to load GGUF model "{model_id}": {exc}') from exc

            self._model_id = model_id
            device = 'cpu' if n_gpu_layers == 0 else 'gpu'
            self._status = ModelStatus(
                model_id=model_id,
                backend='llamacpp',
                device=device,
                quant=self._infer_quant(model_id),
                context_tokens=n_ctx
            )
            return self._status

    def unload(self) -> None:
        with self._lock:
            self._release()

    def _release(self) -> None:
        self._llm = None
        self._model_id = None
        self._status = None

    def generate(self, prompt: str, params: GenerateParams) -> Iterator[str]:
        with self._lock:
            if self._llm is None:
                raise EngineError('No model loaded')
            llm = self._llm

        pending = ''
        emitted = 0

        try:
            stream = llm(
                prompt,
                max_tokens=params.max_tokens,
                temperature=params.temperature,
                top_p=params.top_p,
                repeat_penalty=params.repetition_penalty,
                seed=params.seed if params.seed is not None else -1,
                stop=params.stop or None,
                stream=True
            )
            for chunk in stream:
                text = chunk.get('choices', [{}])[0].get('text', '')
                if not text:
                    continue
                pending += text
                trimmed, stopped = self.apply_stop(pending, params.stop)
                if trimmed and len(trimmed) > emitted:
                    yield trimmed[emitted:]
                    emitted = len(trimmed)
                if stopped:
                    return
                if len(pending) > emitted + 16:
                    yield pending[emitted:]
                    emitted = len(pending)
            if len(pending) > emitted:
                yield pending[emitted:]
        except Exception as exc:
            raise EngineError(f'Generation failed: {exc}') from exc

    def tokenize(self, text: str) -> list[int]:
        with self._lock:
            if self._llm is None:
                raise EngineError('No model loaded')
            return list(self._llm.tokenize(text.encode('utf-8')))

    def status(self) -> ModelStatus | None:
        return self._status

    def apply_chat_template(
        self,
        messages: list[dict[str, str]],
        tools: list[dict[str, Any]] | None = None
    ) -> str:
        with self._lock:
            if self._llm is None:
                raise EngineError('No model loaded')
            try:
                return self._llm.create_chat_completion_openai_v1_offline(
                    messages=messages, tools=tools
                )
            except Exception:
                pass
        return MLX_FALLBACK_TEMPLATE(messages)

    @staticmethod
    def _infer_quant(model_id: str) -> str | None:
        lowered = model_id.lower()
        for tag in ('q2_k', 'q3_k', 'q4_k', 'q5_k', 'q6_k', 'q8_0', 'f16', 'f32'):
            if tag in lowered:
                return tag.upper().replace('_', '_')
        return None


def MLX_FALLBACK_TEMPLATE(messages: list[dict[str, str]]) -> str:
    """Shared minimal ChatML renderer for backends without template support."""
    parts: list[str] = []
    for m in messages:
        parts.append(f'<|im_start|>{m.get("role", "user")}\n{m.get("content", "")}<|im_end|>')
    parts.append('<|im_start|>assistant\n')
    return '\n'.join(parts)
