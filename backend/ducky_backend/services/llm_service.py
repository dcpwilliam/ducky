"""LLM service — JSON-RPC surface for local model inference.

Two constraints shape this file:

1.  The dispatcher runs a single asyncio loop, so any blocking call here would
    freeze every other RPC (monitoring, notebook, pip). All engine work is
    therefore pushed onto a dedicated worker thread.
2.  Generation is incremental. Tokens produced on the worker thread are pushed
    back to the loop with ``run_coroutine_threadsafe`` so the UI can render
    them as they arrive instead of waiting for the full answer.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
import uuid
from typing import Any, Awaitable, Callable

from ducky_backend.llm.engine import (
    BaseEngine,
    EngineError,
    GenerateParams,
    create_engine,
    detect_backend,
    is_apple_silicon,
)
from ducky_backend.llm.mlx_engine import recommended_models

logger = logging.getLogger('ducky.llm')

NotifyFn = Callable[[str, Any], Awaitable[None]]


class LLMService:
    def __init__(self, notify: NotifyFn) -> None:
        self.notify = notify
        self._engine: BaseEngine | None = None
        self._engine_lock = threading.Lock()
        # One generation at a time keeps memory predictable and makes
        # cancellation unambiguous.
        self._gen_lock = threading.Lock()
        self._cancel = threading.Event()
        self._active_job: str | None = None
        self._executor = __import__('concurrent.futures', fromlist=[
            'ThreadPoolExecutor'
        ]).ThreadPoolExecutor(max_workers=2, thread_name_prefix='ducky-llm')

    # -- engine access --------------------------------------------------

    def _get_engine(self, preferred: str | None = None) -> BaseEngine:
        with self._engine_lock:
            if self._engine is None:
                self._engine = create_engine(preferred)
            return self._engine

    def _reset_engine(self, preferred: str | None = None) -> None:
        with self._engine_lock:
            if self._engine is not None:
                try:
                    self._engine.unload()
                except Exception:
                    pass
            self._engine = create_engine(preferred)

    # ---- helpers to hop between the worker thread and the loop --------

    def _emit(self, topic: str, payload: Any) -> None:
        """Thread-safe fire-and-forget notification."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                return
            asyncio.run_coroutine_threadsafe(self.notify(topic, payload), loop)
        except RuntimeError:
            logger.debug('No running loop, dropping %s', topic)

    async def _run(self, fn: Callable[[], Any]) -> Any:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, fn)

    # ---- RPC methods --------------------------------------------------

    async def backend_info(self, **_: Any) -> dict[str, Any]:
        info = detect_backend()
        payload = info.to_dict()
        payload['appleSilicon'] = is_apple_silicon()
        payload['recommendedModels'] = recommended_models()
        return payload

    async def list_models(self, **_: Any) -> dict[str, Any]:
        return {'models': recommended_models()}

    async def load_model(self, modelId: str = '', backend: str | None = None,
                         **opts: Any) -> dict[str, Any]:
        if not modelId:
            raise ValueError('modelId is required')

        def work() -> dict[str, Any]:
            engine = self._get_engine(backend)
            status = engine.load(modelId, **opts)
            return status.to_dict()

        await self._emit_status('loading', modelId)
        try:
            result = await self._run(work)
        except EngineError:
            # A failed load can leave a half-initialised engine behind.
            self._reset_engine(backend)
            raise
        await self._emit_status('loaded', modelId)
        return result

    async def unload_model(self, **_: Any) -> dict[str, Any]:
        def work() -> None:
            if self._engine is not None:
                self._engine.unload()

        await self._run(work)
        await self._emit_status('unloaded', None)
        return {'success': True}

    async def status(self, **_: Any) -> dict[str, Any]:
        engine = self._engine
        status = engine.status() if engine else None
        info = detect_backend()
        result: dict[str, Any] = {
            'loaded': status is not None,
            'model': status.to_dict() if status else None,
            'backend': info.to_dict(),
            'generating': self._active_job is not None
        }
        if isinstance(engine, object) and hasattr(engine, 'active_memory_gb'):
            active = engine.active_memory_gb()  # type: ignore[attr-defined]
            if active is not None:
                result['activeMemoryGb'] = active
        return result

    # ---- generation ---------------------------------------------------

    async def generate_stream(
        self,
        prompt: str = '',
        messages: list[dict[str, str]] | None = None,
        params: dict[str, Any] | None = None,
        tools: list[dict[str, Any]] | None = None,
        jobId: str | None = None,
        **_: Any
    ) -> dict[str, Any]:
        """Stream a completion, emitting ``llm.token`` notifications."""
        job_id = jobId or uuid.uuid4().hex[:12]
        gen_params = GenerateParams.from_dict(params)
        engine = self._get_engine()

        final_prompt = prompt
        if not final_prompt and messages:
            final_prompt = await self._run(
                lambda: engine.apply_chat_template(messages, tools)  # type: ignore[attr-defined]
            )
        if not final_prompt:
            raise ValueError('Either prompt or messages must be provided')

        self._cancel.clear()
        self._active_job = job_id

        started = time.time()
        prompt_tokens = await self._run(lambda: engine.count_tokens(final_prompt))
        await self.notify('llm.start', {
            'jobId': job_id,
            'promptTokens': prompt_tokens
        })

        def work() -> dict[str, Any]:
            chunks: list[str] = []
            count = 0
            try:
                for chunk in engine.generate(final_prompt, gen_params):
                    if self._cancel.is_set():
                        break
                    chunks.append(chunk)
                    count += 1
                    self._emit('llm.token', {
                        'jobId': job_id,
                        'text': chunk,
                        'index': count
                    })
                text = ''.join(chunks)
                completion_tokens = engine.count_tokens(text)
                return {
                    'text': text,
                    'cancelled': self._cancel.is_set(),
                    'promptTokens': prompt_tokens,
                    'completionTokens': completion_tokens,
                    'elapsedMs': int((time.time() - started) * 1000)
                }
            except Exception as exc:
                logger.exception('Stream generation failed')
                self._emit('llm.error', {'jobId': job_id, 'message': str(exc)})
                return {'text': ''.join(chunks), 'error': str(exc),
                        'cancelled': False}

        try:
            if not self._gen_lock.acquire(timeout=0.1):
                raise EngineError('Another generation is already running')
            try:
                result = await self._run(work)
            finally:
                self._gen_lock.release()
        finally:
            self._active_job = None

        result['jobId'] = job_id
        if result.get('error'):
            raise EngineError(result['error'])

        tps = 0.0
        elapsed = result.get('elapsedMs', 0)
        if elapsed > 0 and result.get('completionTokens'):
            tps = round(result['completionTokens'] / (elapsed / 1000), 1)
        result['tokensPerSecond'] = tps

        await self.notify('llm.done', {
            'jobId': job_id,
            'text': result['text'],
            'cancelled': result.get('cancelled', False),
            'tokensPerSecond': tps,
            'completionTokens': result.get('completionTokens', 0),
            'elapsedMs': elapsed
        })
        return result

    async def generate(self, prompt: str = '',
                       messages: list[dict[str, str]] | None = None,
                       params: dict[str, Any] | None = None,
                       tools: list[dict[str, Any]] | None = None,
                       **_: Any) -> dict[str, Any]:
        """Non-streaming convenience wrapper around generate_stream."""
        return await self.generate_stream(
            prompt=prompt,
            messages=messages,
            params=params,
            tools=tools,
            _silent=True
        )

    async def cancel(self, **_: Any) -> dict[str, Any]:
        if self._active_job:
            self._cancel.set()
            return {'success': True, 'jobId': self._active_job}
        return {'success': False, 'reason': 'no active generation'}

    async def count_tokens(self, text: str = '', **_: Any) -> dict[str, Any]:
        engine = self._get_engine()
        try:
            count = await self._run(lambda: engine.count_tokens(text))
            return {'tokens': count}
        except EngineError:
            return {'tokens': max(1, len(text) // 3), 'estimated': True}

    # ---- internal -----------------------------------------------------

    async def _emit_status(self, state: str, model_id: str | None) -> None:
        await self.notify('llm.status', {'state': state, 'modelId': model_id})

    def shutdown(self) -> None:
        self._cancel.set()
        try:
            self._executor.shutdown(wait=False)
        except Exception:
            pass
