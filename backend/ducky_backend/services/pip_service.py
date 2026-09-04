import asyncio
import json
import os
import logging
from typing import Any, Callable, Awaitable

logger = logging.getLogger('ducky.pip')

NotifyFn = Callable[[str, Any], Awaitable[None]]


class PipService:
    def __init__(self, notify: NotifyFn) -> None:
        self.notify = notify

    def _python_exe(self, env_path: str) -> str:
        if os.name == 'nt':
            return os.path.join(env_path, 'Scripts', 'python.exe')
        return os.path.join(env_path, 'bin', 'python')

    async def list_packages(self, envPath: str = '', **kw: Any) -> dict:
        python = self._python_exe(envPath)
        proc = await asyncio.create_subprocess_exec(
            python, '-m', 'pip', 'list', '--format=json',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()

        if proc.returncode != 0:
            return {'packages': []}

        packages = json.loads(stdout.decode())
        return {'packages': packages}

    async def install(self, envPath: str = '', packages: list = None, **kw: Any) -> dict:
        if not packages:
            raise ValueError('No packages specified')

        python = self._python_exe(envPath)
        await self.notify('env.opProgress', {'message': f'Installing {", ".join(packages)}...'})

        proc = await asyncio.create_subprocess_exec(
            python, '-m', 'pip', 'install', *packages,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )

        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode().strip()
            if text:
                await self.notify('env.opProgress', {'message': text})

        await proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f'pip install failed with code {proc.returncode}')

        await self.notify('env.opProgress', {'message': 'Installation complete'})
        return {'success': True}

    async def uninstall(self, envPath: str = '', package: str = '', **kw: Any) -> dict:
        python = self._python_exe(envPath)
        await self.notify('env.opProgress', {'message': f'Uninstalling {package}...'})

        proc = await asyncio.create_subprocess_exec(
            python, '-m', 'pip', 'uninstall', package, '-y',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f'pip uninstall failed with code {proc.returncode}')

        return {'success': True}

    async def update(self, envPath: str = '', packages: list = None, **kw: Any) -> dict:
        if not packages:
            raise ValueError('No packages specified')

        python = self._python_exe(envPath)
        await self.notify('env.opProgress', {'message': f'Updating {", ".join(packages)}...'})

        proc = await asyncio.create_subprocess_exec(
            python, '-m', 'pip', 'install', '--upgrade', *packages,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )

        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode().strip()
            if text:
                await self.notify('env.opProgress', {'message': text})

        await proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f'pip update failed with code {proc.returncode}')

        return {'success': True}
