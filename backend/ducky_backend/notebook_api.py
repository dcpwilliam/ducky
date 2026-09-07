"""Objects injected into every notebook namespace.

Cells are ordinary synchronous Python, but the model lives on the asyncio side
of the backend. The classes here bridge the two, so a cell can simply write::

    llm.chat("Explain KV cache in one sentence")
    for tok in llm.stream("Write a haiku"):
        print(tok, end="", flush=True)
    agent = Agent(llm, tools=[calculator])
    agent.run("What is 15 * 24?")
    agent.trace[0]

Bridging rules that matter:
  * Generation runs on the LLM service's worker thread, never on the event loop
    and never on the cell's own thread (which must stay free to consume tokens).
  * Tokens cross threads through a queue, so streaming works inside a cell.
"""

from __future__ import annotations

import asyncio
import queue
import time
import uuid
from typing import Any, AsyncIterator, Iterator

from ducky_backend.llm.engine import GenerateParams

logger = __import__('logging').getLogger('ducky.notebook')


class SyncLLM:
    """Blocking, cell-friendly wrapper over the async LLM service."""

    def __init__(self, service: Any, loop: asyncio.AbstractEventLoop) -> None:
        self._service = service
        self._loop = loop

    # -- convenience ----------------------------------------------------

    def chat(self, messages: Any, **params: Any) -> str:
        """Send messages (or a plain string) and return the full reply."""
        return ''.join(self.stream(_as_messages(messages), **params))

    def complete(self, prompt: str, **params: Any) -> str:
        """Raw completion with no chat template applied."""
        return ''.join(self.stream(prompt=prompt, **params))

    # -- core -----------------------------------------------------------

    def stream(self, messages: Any = None, prompt: str = '',
               **params: Any) -> Iterator[str]:
        """Yield tokens as they are produced."""
        service = self._service
        engine = service._get_engine()

        gen_params = GenerateParams.from_dict(params)
        final_prompt = prompt
        if not final_prompt:
            final_prompt = engine.apply_chat_template(_as_messages(messages))

        q: queue.Queue = queue.Queue()
        started = time.time()

        def work() -> None:
            try:
                for chunk in engine.generate(final_prompt, gen_params):
                    q.put(('token', chunk))
            except Exception as exc:  # noqa: BLE001 - reported into the cell
                q.put(('error', f'{type(exc).__name__}: {exc}'))
            finally:
                q.put(('end', None))

        # Schedule on the service's executor. Call-soon keeps us from touching
        # the loop directly from the cell thread.
        self._loop.call_soon_threadsafe(
            lambda: asyncio.ensure_future(
                self._loop.run_in_executor(service._executor, work)
            )
        )

        text_parts: list[str] = []
        while True:
            kind, payload = q.get()
            if kind == 'token':
                text_parts.append(payload)
                yield payload
            elif kind == 'error':
                raise RuntimeError(payload)
            else:
                break

        # Record usage so notebook cells and the status panel agree.
        try:
            elapsed = int((time.time() - started) * 1000)
            full = ''.join(text_parts)
            tokens = engine.count_tokens(full)
            tps = round(tokens / (elapsed / 1000), 1) if elapsed > 0 else 0
            self.last_stats = {  # type: ignore[attr-defined]
                'tokens': tokens,
                'elapsedMs': elapsed,
                'tokensPerSecond': tps
            }
        except Exception:
            pass

    async def achat(self, messages: Any, **params: Any) -> str:
        """Async variant, for cells that await directly."""
        return await asyncio.get_event_loop().run_in_executor(
            self._service._executor,
            lambda: self.chat(messages, **params)
        )

    # -- introspection --------------------------------------------------

    def status(self) -> dict[str, Any]:
        engine = self._service._engine
        st = engine.status() if engine else None
        return {
            'loaded': st is not None,
            'model': st.to_dict() if st else None,
            'backend': type(engine).__name__ if engine else None
        }

    def __repr__(self) -> str:
        st = self.status()
        if not st['loaded']:
            return ('<LLM: no model loaded — call load_model("mlx-community/'
                    'Qwen2.5-0.5B-Instruct-4bit")>')
        model = st['model']
        return (f"<LLM: {model['modelId']} via {model['backend']} "
                f"on {model['device']}>")


def _as_messages(value: Any) -> list[dict[str, str]]:
    if isinstance(value, str):
        return [{'role': 'user', 'content': value}]
    if isinstance(value, dict):
        return [value]
    if isinstance(value, list):
        out: list[dict[str, str]] = []
        for item in value:
            if isinstance(item, str):
                out.append({'role': 'user', 'content': item})
            else:
                out.append(item)
        return out
    return [{'role': 'user', 'content': str(value)}]


# ---- display helpers -------------------------------------------------


class HTML:
    """Wrap a string so it renders as HTML in the cell output."""

    def __init__(self, data: str) -> None:
        self.data = data

    def _repr_html_(self) -> str:
        return self.data

    def __repr__(self) -> str:
        return f'HTML({len(self.data)} chars)'


class Markdown:
    def __init__(self, data: str) -> None:
        self.data = data

    def _repr_markdown_(self) -> str:
        return self.data

    def __repr__(self) -> str:
        return f'Markdown({len(self.data)} chars)'


class JSONView:
    """Render a dict/list as collapsible-ish JSON in the output pane."""

    def __init__(self, data: Any) -> None:
        self.data = data

    def _repr_json_(self) -> Any:
        return self.data

    def __repr__(self) -> str:
        import json
        return json.dumps(self.data, ensure_ascii=False, indent=2)[:500]


def build_injected_api(session: Any, llm_service: Any,
                       loop: asyncio.AbstractEventLoop) -> dict[str, Any]:
    """Assemble the globals available inside every cell."""
    from ducky_backend.agent_runtime import Agent, Tool, tool  # local import

    display_queue: list[Any] = []

    def display(obj: Any) -> None:
        """Show a value in the cell output without it being the last line."""
        display_queue.append(obj)

    def show_html(html: str) -> None:
        display_queue.append(HTML(html))

    def table(rows: list[dict[str, Any]], max_rows: int = 50) -> HTML:
        """Render a list of dicts as an HTML table."""
        if not rows:
            return HTML('<i>(empty)</i>')
        keys: list[str] = []
        for row in rows:
            for key in row:
                if key not in keys:
                    keys.append(key)
        head = ''.join(f'<th style="text-align:left;padding:4px 10px;'
                       f'border-bottom:1px solid #2a2f45">{_esc(str(k))}</th>'
                       for k in keys)
        body_rows = []
        for row in rows[:max_rows]:
            cells = ''.join(
                f'<td style="padding:4px 10px;border-bottom:1px solid #1e2233">'
                f'{_esc(str(row.get(k, "")))}</td>'
                for k in keys
            )
            body_rows.append(f'<tr>{cells}</tr>')
        extra = ''
        if len(rows) > max_rows:
            extra = f'<div style="color:#7c8db5">… {len(rows) - max_rows} more</div>'
        return HTML(
            f'<table style="border-collapse:collapse;font-size:12px">'
            f'<thead><tr>{head}</tr></thead><tbody>{"".join(body_rows)}</tbody>'
            f'</table>{extra}'
        )

    def load_model(model_id: str, **opts: Any) -> dict[str, Any]:
        """Load a local model synchronously from inside a cell."""
        fut = asyncio.run_coroutine_threadsafe(
            llm_service.load_model(modelId=model_id, **opts), loop
        )
        return fut.result(timeout=600)

    def _esc(text: str) -> str:
        return (str(text).replace('&', '&amp;').replace('<', '&lt;')
                .replace('>', '&gt;'))

    return {
        'llm': SyncLLM(llm_service, loop),
        'Agent': Agent,
        'Tool': Tool,
        'tool': tool,
        'display': display,
        'show_html': show_html,
        'table': table,
        'HTML': HTML,
        'Markdown': Markdown,
        'JSONView': JSONView,
        'load_model': load_model,
        '_ducky_display_queue': display_queue,
    }
