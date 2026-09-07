"""ReAct agent runtime designed to be inspected, not just executed.

Debugging an agent means seeing what it saw. Every step is therefore recorded
as a plain record (thought / action / observation) and execution can be advanced
one step at a time, so a notebook cell can run ``agent.step()``, inspect the
result, and decide what to do next.

The prompt format is deliberately simple because the target models are small
(0.5B-3B). A strict JSON protocol would produce more malformed output than a
line-oriented one, so actions are parsed as::

    THOUGHT: ...
    ACTION: tool_name
    INPUT: {"arg": "value"}

with ``FINAL:`` terminating the loop. Parsing is tolerant: if the model emits
bare JSON or prose, we fall back to heuristics rather than failing the step.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Iterator

logger = logging.getLogger('ducky.agent')


@dataclass
class Tool:
    """A callable the agent may invoke."""

    name: str
    description: str
    fn: Callable[..., Any]

    def run(self, **kwargs: Any) -> Any:
        return self.fn(**kwargs)

    def signature(self) -> str:
        import inspect
        try:
            params = inspect.signature(self.fn).parameters
            names = [p for p in params if p not in ('self',)]
            return f'{self.name}({", ".join(names)})' if names else f'{self.name}()'
        except (TypeError, ValueError):
            return f'{self.name}(...)'


def tool(name: str, description: str) -> Callable[..., Any]:
    """Decorator turning a plain function into an agent Tool."""

    def wrapper(fn: Callable[..., Any]) -> Tool:
        return Tool(name=name, description=description, fn=fn)

    return wrapper  # type: ignore[return-value]


@dataclass
class Step:
    """One thought-action-observation cycle."""

    index: int
    raw: str = ''
    thought: str = ''
    action: str | None = None
    action_input: dict[str, Any] = field(default_factory=dict)
    observation: Any = None
    error: str | None = None
    is_final: bool = False
    elapsed_ms: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            'index': self.index,
            'raw': self.raw,
            'thought': self.thought,
            'action': self.action,
            'actionInput': self.action_input,
            'observation': _stringify(self.observation),
            'error': self.error,
            'isFinal': self.is_final,
            'elapsedMs': self.elapsed_ms
        }

    def _repr_html_(self) -> str:
        """Rich rendering so a bare ``step`` in a cell renders nicely."""
        parts = [f'<div style="font-family:ui-monospace,monospace;font-size:12px;'
                 f'line-height:1.5">']
        parts.append(f'<div style="color:#7c8db5">step {self.index}</div>')
        if self.thought:
            parts.append(f'<div><b>thought</b> {_esc(self.thought)}</div>')
        if self.action:
            parts.append(
                f'<div><b>action</b> <code style="color:#c792ea">{_esc(self.action)}</code>'
                f' {_esc(json.dumps(self.action_input, ensure_ascii=False))}</div>'
            )
        if self.error:
            parts.append(f'<div style="color:#f07178"><b>error</b> {_esc(self.error)}</div>')
        if self.observation is not None and not self.is_final:
            obs = _stringify(self.observation)
            parts.append(f'<div style="color:#8ac6a0"><b>obs</b> {_esc(obs[:400])}</div>')
        if self.is_final:
            parts.append(f'<div style="color:#82aaff"><b>final</b> '
                         f'{_esc(str(self.observation)[:600])}</div>')
        parts.append('</div>')
        return ''.join(parts)


class Agent:
    """A minimal ReAct loop driven by a local model."""

    def __init__(
        self,
        llm: Any,
        tools: list[Tool] | None = None,
        system_prompt: str | None = None,
        max_steps: int = 8,
        max_tokens: int = 320,
        temperature: float = 0.2
    ) -> None:
        self.llm = llm
        self.tools: list[Tool] = tools or []
        self.system_prompt = system_prompt or self._default_system()
        self.max_steps = max_steps
        self.max_tokens = max_tokens
        self.temperature = temperature

        self.task: str = ''
        self.history: list[dict[str, str]] = []
        self.trace: list[Step] = []
        self.finished = False
        self.answer: str | None = None

    # ---- setup --------------------------------------------------------

    def add_tool(self, t: Tool) -> 'Agent':
        self.tools.append(t)
        return self

    def reset(self, task: str) -> 'Agent':
        self.task = task
        self.history = [
            {'role': 'system', 'content': self.system_prompt},
            {'role': 'user', 'content': f'Task: {task}'}
        ]
        self.trace = []
        self.finished = False
        self.answer = None
        return self

    # ---- execution ----------------------------------------------------

    def step(self) -> Step:
        """Advance exactly one thought-action-observation cycle."""
        import time

        if self.finished:
            raise RuntimeError('Agent already finished. Call reset(task) first.')
        if not self.task:
            raise RuntimeError('No task set. Call reset(task) first.')

        started = time.time()
        index = len(self.trace)

        raw = self.llm.chat(
            self.history,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            stop=['\nObservation:', '\nTask:']
        )

        step = Step(index=index, raw=raw)
        step.thought, step.action, step.action_input, step.is_final = parse_action(raw)

        if step.is_final:
            step.observation = step.thought or step.action_input.get('answer', raw)
            self.answer = str(step.observation)
            self.finished = True
        elif step.action:
            try:
                tool = self._find_tool(step.action)
                if tool is None:
                    available = ', '.join(t.name for t in self.tools) or '(none)'
                    step.error = f'Unknown tool "{step.action}". Available: {available}'
                    step.observation = step.error
                else:
                    result = tool.run(**step.action_input)
                    step.observation = result
            except Exception as exc:
                step.error = f'{type(exc).__name__}: {exc}'
                step.observation = step.error
        else:
            # No parseable action: treat the whole output as the final answer
            # rather than looping forever on a confused small model.
            step.is_final = True
            step.observation = raw.strip()
            self.answer = step.observation
            self.finished = True

        step.elapsed_ms = int((time.time() - started) * 1000)
        self.trace.append(step)

        # Feed the result back so the next step has context.
        self.history.append({'role': 'assistant', 'content': raw.strip()})
        if not step.is_final:
            self.history.append({
                'role': 'user',
                'content': f'Observation: {_stringify(step.observation)}'
            })

        return step

    def run(self, task: str | None = None, verbose: bool = False) -> str:
        """Run to completion (or max_steps). Returns the final answer."""
        if task is not None:
            self.reset(task)
        while not self.finished and len(self.trace) < self.max_steps:
            s = self.step()
            if verbose:
                print(f'[step {s.index}] {s.action or "FINAL"} -> '
                      f'{_stringify(s.observation)[:200]}')
        if not self.finished and self.answer is None:
            self.answer = ('(max steps reached) ' +
                           _stringify(self.trace[-1].observation)
                           if self.trace else '(no steps run)')
            self.finished = True
        return self.answer or ''

    def steps(self) -> Iterator[Step]:
        """Iterate steps lazily until the agent finishes."""
        while not self.finished and len(self.trace) < self.max_steps:
            yield self.step()

    # ---- introspection ------------------------------------------------

    def _find_tool(self, name: str) -> Tool | None:
        lowered = name.strip().lower()
        for t in self.tools:
            if t.name.lower() == lowered:
                return t
        # Tolerate the model echoing a signature such as "search(query)".
        match = re.match(r'([A-Za-z_][A-Za-z0-9_]*)', lowered)
        if match:
            base = match.group(1)
            for t in self.tools:
                if t.name.lower() == base:
                    return t
        return None

    def _default_system(self) -> str:
        first_tool = self.tools[0].name if self.tools else 'none'
        return SYSTEM_TEMPLATE.format(
            tools=self._render_tools(),
            example=self._render_example(),
            tools_example_name=first_tool,
        )

    def _render_tools(self) -> str:
        if not self.tools:
            return '(no tools available — answer directly)'
        return '\n'.join(f'- {t.name}: {t.description} ({t.signature()})'
                         for t in self.tools)

    def _render_example(self) -> str:
        """A concrete few-shot dialogue using the real tool names.

        Tiny models (0.5B–3B) copy the literal placeholder ``tool_name`` from the
        instructions unless they see the actual tool identifier exercised. We build
        the example from the first registered tool so the demonstration always uses
        a name that exists.
        """
        if not self.tools:
            return ''
        t = self.tools[0]
        sample: dict[str, Any] = {}
        try:
            import inspect
            params = inspect.signature(t.fn).parameters
            for pname, p in params.items():
                if pname == 'self':
                    continue
                ann = p.annotation
                if ann in (int, float):
                    sample[pname] = 3
                else:
                    sample[pname] = 'value'
        except Exception:
            pass
        args_json = json.dumps(sample, ensure_ascii=False)
        # Keep the demonstration self-consistent: derive a plausible observation
        # from the sample args so INPUT -> Observation -> FINAL line up.
        if sample and all(isinstance(v, (int, float)) for v in sample.values()):
            obs = sum(sample.values())
        elif sample and all(isinstance(v, str) for v in sample.values()):
            obs = ''.join(sample.values())
        else:
            obs = 'the tool result'
        return (
            "Example dialogue:\n"
            f"Task: use {t.name} to solve the problem\n"
            f"THOUGHT: I should call the {t.name} tool with its arguments.\n"
            f"ACTION: {t.name}\n"
            f"INPUT: {args_json}\n"
            f"Observation: {obs}\n"
            f"THOUGHT: The {t.name} tool returned {obs}, which is the answer.\n"
            f"FINAL: {obs}\n"
        )

    def _repr_html_(self) -> str:
        rows = []
        for s in self.trace:
            rows.append(s._repr_html_())
        state = 'finished' if self.finished else 'running'
        head = (f'<div style="font-family:ui-monospace,monospace;font-size:12px">'
                f'<b>Agent</b> ({state}, {len(self.trace)}/{self.max_steps} steps, '
                f'{len(self.tools)} tools)</div>')
        tail = ''
        if self.answer is not None:
            tail = (f'<div style="font-family:ui-monospace,monospace;font-size:12px;'
                    f'color:#82aaff;margin-top:6px"><b>answer</b> '
                    f'{_esc(str(self.answer)[:500])}</div>')
        return head + ''.join(rows) + tail

    def summary(self) -> str:
        lines = [f'Agent: {len(self.trace)} steps, '
                 f'{"finished" if self.finished else "running"}']
        for s in self.trace:
            action = s.action or ('FINAL' if s.is_final else '?')
            lines.append(f'  {s.index}. {action}: {_stringify(s.observation)[:120]}')
        if self.answer is not None:
            lines.append(f'answer: {self.answer[:300]}')
        return '\n'.join(lines)


SYSTEM_TEMPLATE = """You are a concise AI agent. Solve the task using tools when they help.

Available tools:
{tools}

Respond using EXACTLY this format:

THOUGHT: your reasoning in one short sentence
ACTION: <the exact tool name from the list above>
INPUT: {{"arg": "value"}}

When you know the answer, respond with:

THOUGHT: your reasoning
FINAL: the answer

Rules:
- Emit only one ACTION or FINAL per response.
- ACTION must be a real tool name from the list (for example: {tools_example_name}).
- INPUT must be valid JSON matching the tool signature.
- Never invent tool names.

{example}"""


def parse_action(text: str) -> tuple[str, str | None, dict[str, Any], bool]:
    """Extract (thought, action, input, is_final) from a model response."""
    thought = _capture(r'THOUGHT:\s*(.*?)(?=\n(?:ACTION|FINAL):|$)', text)
    final = _capture(r'FINAL:\s*(.*)$', text)
    if final is not None:
        return thought, None, {'answer': final}, True

    action = _capture(r'ACTION:\s*(\S+)', text)
    raw_input = _capture(r'INPUT:\s*(.*)$', text)

    params: dict[str, Any] = {}
    if raw_input:
        params = _parse_json_object(raw_input)

    if action is None:
        # Fall back: a bare {"tool": ...} object.
        obj = _parse_json_object(text)
        if isinstance(obj, dict) and 'tool' in obj:
            action = str(obj['tool'])
            params = obj.get('input') if isinstance(obj.get('input'), dict) else {
                k: v for k, v in obj.items() if k not in ('tool', 'input')
            }

    if action:
        action = action.strip().strip('`"\'')
        # "search(query)" -> "search"
        match = re.match(r'([A-Za-z_][A-Za-z0-9_]*)\s*\(', action)
        if match:
            action = match.group(1)

    return thought, action, params or {}, False


def _capture(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, re.DOTALL | re.MULTILINE)
    if not match:
        return None
    value = match.group(1).strip()
    return value or None


def _parse_json_object(text: str) -> Any:
    """Best-effort JSON extraction, tolerating prose around the object."""
    text = text.strip()
    text = re.sub(r'^```(?:json)?|```$', '', text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    return {}


def _stringify(value: Any, limit: int = 800) -> str:
    if value is None:
        return ''
    if isinstance(value, str):
        return value if len(value) <= limit else value[:limit] + '…'
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = repr(value)
    return text if len(text) <= limit else text[:limit] + '…'


def _esc(text: str) -> str:
    return (str(text)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;'))
