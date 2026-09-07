#!/usr/bin/env python3
"""Smoke-test the Ducky backend over JSON-RPC without launching Electron.

Usage: python3 scripts/smoke_backend.py [--model <hf-id>] [--skip-model]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / 'backend'
VENV_PY = BACKEND / '.venv' / 'bin' / 'python3'
PY = str(VENV_PY if VENV_PY.exists() else 'python3')


class Client:
    def __init__(self) -> None:
        # Inherit the environment so HF_ENDPOINT / proxy settings apply, then
        # make sure the backend package is importable.
        env = dict(os.environ)
        env['PYTHONPATH'] = str(BACKEND)
        self.proc = subprocess.Popen(
            [PY, '-m', 'ducky_backend'],
            cwd=str(BACKEND),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            env=env,
            text=True,
            bufsize=1
        )
        self._id = 0

    def call(self, method: str, params: dict | None = None, timeout: float = 120.0):
        self._id += 1
        req = {'jsonrpc': '2.0', 'id': self._id, 'method': method,
               'params': params or {}}
        assert self.proc.stdin
        self.proc.stdin.write(json.dumps(req) + '\n')
        self.proc.stdin.flush()

        deadline = time.time() + timeout
        while time.time() < deadline:
            line = self.proc.stdout.readline()  # type: ignore[union-attr]
            if not line:
                raise RuntimeError('backend closed stdout')
            msg = json.loads(line)
            if msg.get('method') == 'notify':
                continue
            if msg.get('id') == self._id:
                if 'error' in msg:
                    raise RuntimeError(f"{method}: {msg['error']['message']}")
                return msg.get('result')
        raise TimeoutError(f'{method} timed out after {timeout}s')

    def close(self) -> None:
        try:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


def ok(label: str) -> None:
    print(f'  \033[32mPASS\033[0m {label}')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='mlx-community/Qwen2.5-0.5B-Instruct-4bit')
    ap.add_argument('--skip-model', action='store_true')
    args = ap.parse_args()

    print('Starting backend…')
    c = Client()
    try:
        # 1. ping
        res = c.call('ping', timeout=30)
        assert res['status'] == 'ok', res
        ok(f'ping (pid={res["pid"]})')

        # 2. backend detection
        info = c.call('llm.backendInfo', timeout=60)
        print(f'    backend={info["name"]} device={info["device"]} '
              f'available={info["available"]}')
        ok('llm.backendInfo')

        # 3. kernel session
        sess = c.call('kernel.createSession', {'name': 'smoke'}, timeout=30)
        sid = sess['id']
        ok(f'kernel.createSession ({sid})')

        # 4. plain python execution
        r = c.call('kernel.execute', {'sessionId': sid,
                                      'code': 'x = 6 * 7\nprint("calc", x)\nx'},
                   timeout=30)
        assert r['status'] == 'ok', r
        text = ''.join(o.get('text', '') for o in r['outputs'])
        assert 'calc 42' in text and '42' in text, r
        ok(f'kernel.execute (python, count={r["executionCount"]})')

        # 5. injected API present
        r = c.call('kernel.execute', {'sessionId': sid,
                                      'code': 'sorted(k for k in globals() '
                                              'if k in ("llm","Agent","Tool",'
                                              '"tool","display","table","HTML"))'},
                   timeout=30)
        names = r['outputs'][-1]['data']
        assert names == ['Agent', 'HTML', 'Tool', 'display', 'llm', 'table', 'tool'], names
        ok(f'kernel injected API {names}')

        # 6. error propagation
        r = c.call('kernel.execute', {'sessionId': sid,
                                      'code': 'raise ValueError("boom")'}, timeout=30)
        assert r['status'] == 'error' and r['error']['ename'] == 'ValueError', r
        ok('kernel.execute error propagation')

        # 7. agent runtime without a model (pure-python path)
        if not args.skip_model:
            print(f'  Loading {args.model} (first run downloads weights)…')
            t0 = time.time()
            status = c.call('llm.load', {'modelId': args.model}, timeout=1800)
            ok(f'llm.load {status["modelId"]} '
               f'({time.time() - t0:.1f}s, {status.get("paramsB")}B)')

            r = c.call('kernel.execute', {
                'sessionId': sid,
                'code': ('def add(a, b):\n'
                         '    return float(a) + float(b)\n'
                         'agent = Agent(llm, tools=[Tool("add", "Add two numbers", add)])\n'
                         'agent.max_steps = 4\n'
                         'answer = agent.run("What is 17 plus 25?")\n'
                         'len(agent.trace)')
            }, timeout=600)
            assert r['status'] == 'ok', r
            # A scalar result is rendered as a 'text' output; only rich/json/dict
            # outputs carry a 'data' key. Accept either shape.
            _last = r['outputs'][-1]
            _raw = _last.get('data', _last.get('text'))
            try:
                steps = int(_raw)
            except (TypeError, ValueError):
                steps = _raw
            ok(f'agent.run finished in {steps} step(s)')

            r = c.call('kernel.execute', {'sessionId': sid,
                                          'code': 'agent.summary()'}, timeout=60)
            summary = r['outputs'][-1]['text']
            print('    ' + summary.replace('\n', '\n    '))
            ok('agent.summary')

            t0 = time.time()
            gen = c.call('llm.generateStream', {
                'messages': [{'role': 'user', 'content': 'Say hi in 5 words.'}],
                'params': {'max_tokens': 40, 'temperature': 0.7}
            }, timeout=600)
            dt = time.time() - t0
            ok(f'llm.generateStream ({gen["completionTokens"]} tok, '
               f'{gen["tokensPerSecond"]} tok/s, {dt:.1f}s)')
            print(f'    -> {gen["text"][:120]!r}')

        st = c.call('llm.status', timeout=30)
        ok(f'llm.status loaded={st["loaded"]}')
        return 0
    except Exception as exc:
        print(f'  \033[31mFAIL\033[0m {type(exc).__name__}: {exc}')
        return 1
    finally:
        c.close()


if __name__ == '__main__':
    sys.exit(main())
