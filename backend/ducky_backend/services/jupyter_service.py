import asyncio
import os
import logging
from typing import Any, Callable, Awaitable

logger = logging.getLogger('ducky.jupyter')

NotifyFn = Callable[[str, Any], Awaitable[None]]


class JupyterService:
    def __init__(self, notify: NotifyFn) -> None:
        self.notify = notify

    def _python_exe(self, env_path: str) -> str:
        if os.name == 'nt':
            return os.path.join(env_path, 'Scripts', 'python.exe')
        return os.path.join(env_path, 'bin', 'python')

    async def check_installed(self, envPath: str = '', **kw: Any) -> dict:
        python = self._python_exe(envPath)
        try:
            proc = await asyncio.create_subprocess_exec(
                python, '-m', 'jupyter', '--version',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            if proc.returncode == 0:
                return {'installed': True, 'version': stdout.decode().strip().split('\n')[0]}
        except Exception:
            pass
        return {'installed': False}

    async def install(self, envPath: str = '', **kw: Any) -> dict:
        python = self._python_exe(envPath)
        await self.notify('jupyter.status', {'message': 'Installing JupyterLab...'})

        proc = await asyncio.create_subprocess_exec(
            python, '-m', 'pip', 'install', 'jupyterlab',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )

        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode().strip()
            if text:
                await self.notify('jupyter.status', {'message': text})

        await proc.wait()
        if proc.returncode != 0:
            raise RuntimeError('JupyterLab installation failed')

        await self.notify('jupyter.status', {'message': 'JupyterLab installed successfully'})
        return {'success': True}
