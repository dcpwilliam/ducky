"""Notebook kernel — executes Python cells inside the Ducky backend.

Why not embed JupyterLab in a webview (the original design)? Because a Jupyter
server runs in its own process and knows nothing about the model loaded in this
app. A cell could not call ``llm.chat(...)`` or inspect an agent's state, which
is exactly what "debug an agent in a notebook" requires.

By owning the kernel we can inject live bindings into the cell namespace, so the
model and the agent under test are first-class objects in user code.

Cells run in a worker thread. Blocking work there keeps the RPC loop responsive,
and the injected helpers bridge back to the loop with
``run_coroutine_threadsafe`` so the UI stays live while a cell is running.
"""

from __future__ import annotations

import ast
import asyncio
import io
import logging
import sys
import threading
import time
import traceback
import uuid
from contextlib import redirect_stderr, redirect_stdout
from typing import Any, Awaitable, Callable

logger = logging.getLogger('ducky.kernel')

NotifyFn = Callable[[str, Any], Awaitable[None]]

# Any object exposing one of these is rendered as rich output instead of repr().
RICH_METHODS = ('_repr_html_', '_repr_markdown_', '_repr_svg_', '_repr_png_',
                '_repr_json_', '_repr_latex_')


class _StreamBridge(io.TextIOBase):
    """Tee a cell's output: buffer it for the result and stream it to the UI."""

    def __init__(self, session_id: str, cell_id: str, stream: str,
                 emit: Callable[[str, Any], None]) -> None:
        self._session = session_id
        self._cell = cell_id
        self._stream = stream          # 'stdout' | 'stderr'
        self._emit = emit
        self._chunks: list[str] = []
        self._pending = ''
        self._last_flush = 0.0

    def write(self, text: str) -> int:
        if not isinstance(text, str):
            text = str(text)
        self._chunks.append(text)
        self._pending += text
        now = time.time()
        # Coalesce chatty loops into ~50Hz updates so we do not flood IPC.
        if now - self._last_flush > 0.02 or '\n' in text:
            self._flush()
            self._last_flush = now
        return len(text)

    def flush(self) -> None:
        self._flush()

    def _flush(self) -> None:
        if not self._pending:
            return
        payload = self._pending
        self._pending = ''
        self._emit('kernel.stream', {
            'sessionId': self._session,
            'cellId': self._cell,
            'stream': self._stream,
            'text': payload
        })

    def value(self) -> str:
        return ''.join(self._chunks)


class _CellCancel(KeyboardInterrupt):
    """Raised inside a cell when the user requests interruption."""


class Session:
    """One notebook: a persistent Python namespace plus execution state."""

    def __init__(self, session_id: str, name: str, emit: Callable[[str, Any], None],
                 loop: asyncio.AbstractEventLoop) -> None:
        self.id = session_id
        self.name = name
        self.namespace: dict[str, Any] = {'__name__': '__ducky_notebook__'}
        self.execution_count = 0
        self.created_at = time.time()
        self._emit = emit
        self._loop = loop
        self._cancel = threading.Event()
        self._busy = False
        self._lock = threading.Lock()

    # -- injected API ---------------------------------------------------

    def install_builtins(self, api: dict[str, Any]) -> None:
        self.namespace.update(api)

    # -- execution ------------------------------------------------------

    def execute(self, code: str, cell_id: str) -> dict[str, Any]:
        """Run a cell synchronously. Caller must be off the event loop."""
        with self._lock:
            if self._busy:
                return {
                    'status': 'error',
                    'error': 'Session is busy executing another cell'
                }
            self._busy = True
            self._cancel.clear()

        self.execution_count += 1
        exec_count = self.execution_count
        started = time.time()

        stdout_bridge = _StreamBridge(self.id, cell_id, 'stdout', self._emit)
        stderr_bridge = _StreamBridge(self.id, cell_id, 'stderr', self._emit)

        outputs: list[dict[str, Any]] = []
        status = 'ok'
        error: dict[str, Any] | None = None

        self._emit('kernel.status', {
            'sessionId': self.id,
            'cellId': cell_id,
            'status': 'running',
            'executionCount': exec_count
        })

        try:
            # Split off a trailing expression so its value can be displayed,
            # matching how Jupyter shows the last line of a cell.
            tree = ast.parse(code)
            last_expr = None
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                last_expr = ast.Expression(tree.body.pop().value)

            with redirect_stdout(stdout_bridge), redirect_stderr(stderr_bridge):
                if tree.body:
                    exec(compile(tree, f'<cell-{cell_id}>', 'exec'), self.namespace)

                display_value: Any = None
                has_value = False
                if last_expr is not None:
                    display_value = eval(
                        compile(last_expr, f'<cell-{cell_id}>', 'eval'),
                        self.namespace
                    )
                    has_value = True

                # Honour explicit display() calls emitted during exec.
                queued = self.namespace.get('_ducky_display_queue')
                if queued:
                    for item in queued:
                        outputs.append(self._render_output(item))
                    queued.clear()

                if has_value and display_value is not None:
                    outputs.append(self._render_output(display_value))

        except _CellCancel:
            status = 'aborted'
            error = {'ename': 'Interrupt', 'evalue': 'Execution interrupted',
                     'traceback': []}
        except BaseException as exc:  # noqa: BLE001 - surface anything to the UI
            status = 'error'
            tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
            # Drop our own frames so the traceback starts at user code.
            tb = [line for line in tb if 'ducky_backend' not in line]
            error = {
                'ename': type(exc).__name__,
                'evalue': str(exc),
                'traceback': tb
            }
            logger.info('Cell %s raised %s: %s', cell_id, type(exc).__name__, exc)
        finally:
            stdout_bridge.flush()
            stderr_bridge.flush()
            self._busy = False

        stdout_text = stdout_bridge.value()
        stderr_text = stderr_bridge.value()
        if stdout_text:
            outputs.insert(0, {'type': 'stdout', 'text': stdout_text})
        if stderr_text:
            # stderr usually belongs after the value it complained about.
            outputs.append({'type': 'stderr', 'text': stderr_text})

        result: dict[str, Any] = {
            'status': status,
            'executionCount': exec_count,
            'outputs': outputs,
            'elapsedMs': int((time.time() - started) * 1000)
        }
        if error:
            result['error'] = error

        self._emit('kernel.status', {
            'sessionId': self.id,
            'cellId': cell_id,
            'status': status,
            'executionCount': exec_count,
            'result': result
        })
        return result

    def interrupt(self) -> None:
        self._cancel.set()

    @property
    def busy(self) -> bool:
        return self._busy

    @property
    def cancel_event(self) -> threading.Event:
        return self._cancel

    @staticmethod
    def _render_output(value: Any) -> dict[str, Any]:
        """Convert a Python value into a renderer-friendly output record."""
        for method in RICH_METHODS:
            fn = getattr(value, method, None)
            if callable(fn):
                try:
                    data = fn()
                except Exception:
                    continue
                mime = {
                    '_repr_html_': 'text/html',
                    '_repr_markdown_': 'text/markdown',
                    '_repr_svg_': 'image/svg+xml',
                    '_repr_png_': 'image/png',
                    '_repr_json_': 'application/json',
                    '_repr_latex_': 'text/latex'
                }[method]
                return {'type': 'rich', 'mime': mime, 'data': data}

        if isinstance(value, str):
            return {'type': 'text', 'text': value}
        if isinstance(value, dict):
            return {'type': 'json', 'data': _json_safe(value)}
        if isinstance(value, (list, tuple)):
            return {'type': 'json', 'data': _json_safe(list(value))}
        if isinstance(value, (int, float, bool)) or value is None:
            return {'type': 'text', 'text': repr(value)}
        return {'type': 'text', 'text': repr(value)}

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'executionCount': self.execution_count,
            'busy': self._busy,
            'createdAt': self.created_at,
            'variables': self._visible_variables()
        }

    def _visible_variables(self) -> list[dict[str, Any]]:
        """Names worth showing in an inspector, skipping dunders and builtins."""
        out: list[dict[str, Any]] = []
        for key, value in self.namespace.items():
            if key.startswith('_') or key in ('__name__', '__builtins__'):
                continue
            out.append({
                'name': key,
                'type': type(value).__name__,
                'repr': _safe_repr(value)
            })
        return out[:200]


def _safe_repr(value: Any, limit: int = 120) -> str:
    try:
        text = repr(value)
    except Exception:
        return '<unrepresentable>'
    return text if len(text) <= limit else text[:limit] + '…'


def _json_safe(value: Any) -> Any:
    try:
        import json
        json.dumps(value)
        return value
    except Exception:
        return repr(value)


class KernelService:
    """Manages notebook sessions and dispatches cell execution."""

    def __init__(self, notify: NotifyFn, llm_service: Any = None) -> None:
        self.notify = notify
        self.llm_service = llm_service
        self._sessions: dict[str, Session] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._executor = __import__('concurrent.futures', fromlist=[
            'ThreadPoolExecutor'
        ]).ThreadPoolExecutor(max_workers=4, thread_name_prefix='ducky-cell')

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def _emit(self, topic: str, payload: Any) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(self.notify(topic, payload), loop)
        except RuntimeError:
            pass

    # ---- RPC methods --------------------------------------------------

    async def create_session(self, name: str = 'Untitled', **_: Any) -> dict[str, Any]:
        session_id = uuid.uuid4().hex[:12]
        loop = self._loop or asyncio.get_event_loop()
        session = Session(session_id, name, self._emit, loop)
        from ducky_backend.notebook_api import build_injected_api
        session.install_builtins(build_injected_api(session, self.llm_service, loop))
        self._sessions[session_id] = session
        logger.info('Created kernel session %s (%s)', session_id, name)
        return session.to_dict()

    async def delete_session(self, sessionId: str = '', **_: Any) -> dict[str, Any]:
        session = self._require(sessionId)
        session.interrupt()
        del self._sessions[sessionId]
        return {'success': True}

    async def list_sessions(self, **_: Any) -> dict[str, Any]:
        return {'sessions': [s.to_dict() for s in self._sessions.values()]}

    async def execute(self, sessionId: str = '', code: str = '',
                      cellId: str = '', **_: Any) -> dict[str, Any]:
        session = self._require(sessionId)
        cell_id = cellId or uuid.uuid4().hex[:8]

        loop = asyncio.get_event_loop()

        def work() -> dict[str, Any]:
            self._install_tracer(session)
            try:
                return session.execute(code, cell_id)
            finally:
                sys.settrace(None)

        try:
            result = await loop.run_in_executor(self._executor, work)
        except Exception as exc:
            logger.exception('Cell execution crashed')
            result = {
                'status': 'error',
                'error': {'ename': type(exc).__name__, 'evalue': str(exc),
                          'traceback': []}
            }
        result['cellId'] = cell_id
        result['sessionId'] = sessionId
        return result

    async def interrupt(self, sessionId: str = '', **_: Any) -> dict[str, Any]:
        session = self._require(sessionId)
        session.interrupt()
        return {'success': True}

    async def variables(self, sessionId: str = '', **_: Any) -> dict[str, Any]:
        session = self._require(sessionId)
        return {'variables': session._visible_variables()}

    async def set_variable(self, sessionId: str = '', name: str = '',
                           value: Any = None, **_: Any) -> dict[str, Any]:
        session = self._require(sessionId)
        session.namespace[name] = value
        return {'success': True}

    async def delete_variable(self, sessionId: str = '', name: str = '',
                              **_: Any) -> dict[str, Any]:
        session = self._require(sessionId)
        session.namespace.pop(name, None)
        return {'success': True}

    # ---- internals ----------------------------------------------------

    def _require(self, session_id: str) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            raise ValueError(f'Unknown kernel session: {session_id}')
        return session

    @staticmethod
    def _install_tracer(session: Session) -> None:
        """Enable soft cancellation via a per-line trace hook.

        Python cannot kill a thread mid-instruction, so interruption is
        cooperative: the hook raises at the next executed line. Long-running C
        calls (numpy, MLX kernels) will not see it until they return.
        """
        cancel = session.cancel_event

        def tracer(frame, event, arg):  # type: ignore[no-untyped-def]
            if cancel.is_set():
                raise _CellCancel()
            return tracer

        sys.settrace(tracer)
        threading.settrace(tracer)

    def shutdown(self) -> None:
        for session in self._sessions.values():
            session.interrupt()
        self._executor.shutdown(wait=False)
