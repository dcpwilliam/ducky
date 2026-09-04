import asyncio
import sys
import os
import logging
from typing import Any, Callable, Awaitable

logger = logging.getLogger('ducky.venv')

NotifyFn = Callable[[str, Any], Awaitable[None]]


class VenvService:
    def __init__(self, notify: NotifyFn) -> None:
        self.notify = notify

    async def create(self, path: str = '', python: str = '', **kw: Any) -> dict:
        python_cmd = python or sys.executable

        await self.notify('env.opProgress', {'message': f'Creating venv at {path}...'})

        proc = await asyncio.create_subprocess_exec(
            python_cmd, '-m', 'venv', path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f'venv creation failed: {stderr.decode()}')

        await self.notify('env.opProgress', {'message': 'Virtual environment created'})
        return {'success': True, 'path': path}
