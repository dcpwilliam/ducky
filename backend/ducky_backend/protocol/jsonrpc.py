import asyncio
import json
import sys
import logging
from typing import Any, Callable, Awaitable

from ducky_backend.protocol.dispatcher import Dispatcher

logger = logging.getLogger('ducky.protocol')


class JsonRpcHandler:
    def __init__(
        self,
        reader: Any,
        writer: Any,
        dispatcher: Dispatcher
    ) -> None:
        self.reader = reader
        self.writer = writer
        self.dispatcher = dispatcher
        self._write_lock = asyncio.Lock()
        self._running = True

    async def run(self) -> None:
        while self._running:
            try:
                line = await asyncio.get_event_loop().run_in_executor(
                    None, self.reader.readline
                )
                if not line:
                    break

                text = line.decode('utf-8').strip() if isinstance(line, bytes) else line.strip()
                if not text:
                    continue

                try:
                    msg = json.loads(text)
                except json.JSONDecodeError:
                    logger.warning('Invalid JSON: %s', text[:200])
                    continue

                response = await self.dispatcher.handle(msg)
                if response is not None:
                    await self._write(response)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error('Handler error: %s', e, exc_info=True)

    async def _write(self, obj: dict) -> None:
        async with self._write_lock:
            try:
                line = json.dumps(obj, ensure_ascii=False) + '\n'
                self.writer.write(line)
                self.writer.flush()
            except Exception as e:
                logger.error('Write error: %s', e)

    async def send_notification(self, topic: str, payload: Any) -> None:
        await self._write({
            'jsonrpc': '2.0',
            'method': 'notify',
            'params': {'topic': topic, 'payload': payload}
        })

    async def close(self) -> None:
        self._running = False
