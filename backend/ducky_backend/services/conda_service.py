import asyncio
import json
import shutil
import logging
from typing import Any, Callable, Awaitable, Optional

logger = logging.getLogger('ducky.conda')

NotifyFn = Callable[[str, Any], Awaitable[None]]


class CondaService:
    def __init__(self, notify: NotifyFn) -> None:
        self.notify = notify
        self.conda_path: Optional[str] = None

    async def detect(self, **kw: Any) -> dict:
        conda = shutil.which('conda')
        if conda:
            self.conda_path = conda
            try:
                proc = await asyncio.create_subprocess_exec(
                    conda, '--version',
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, _ = await proc.communicate()
                version = stdout.decode().strip()
            except Exception:
                version = 'unknown'
            return {'detected': True, 'path': conda, 'version': version}
        return {'detected': False, 'path': None, 'version': None}

    async def list_envs(self, **kw: Any) -> dict:
        conda = self.conda_path or shutil.which('conda')
        if not conda:
            return {'envs': []}

        proc = await asyncio.create_subprocess_exec(
            conda, 'env', 'list', '--json',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        data = json.loads(stdout.decode())

        envs = []
        for env_path in data.get('envs', []):
            name = env_path.split('/')[-1].split('\\')[-1]
            envs.append({
                'name': name,
                'path': env_path,
                'isDefault': name == 'base'
            })

        return {'envs': envs}

    async def create(self, name: str = '', python: str = '3.11', **kw: Any) -> dict:
        conda = self.conda_path or shutil.which('conda')
        if not conda:
            raise RuntimeError('conda not found')

        await self.notify('env.opProgress', {'message': f'Creating environment "{name}" with Python {python}...'})

        proc = await asyncio.create_subprocess_exec(
            conda, 'create', '-n', name, f'python={python}', '-y', '--json',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
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
            raise RuntimeError(f'conda create failed with code {proc.returncode}')

        await self.notify('env.opProgress', {'message': 'Environment created successfully'})
        return {'success': True, 'name': name}

    async def clone(self, source: str = '', name: str = '', **kw: Any) -> dict:
        conda = self.conda_path or shutil.which('conda')
        if not conda:
            raise RuntimeError('conda not found')

        await self.notify('env.opProgress', {'message': f'Cloning "{source}" to "{name}"...'})

        proc = await asyncio.create_subprocess_exec(
            conda, 'create', '--clone', source, '-n', name, '-y', '--json',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f'conda clone failed with code {proc.returncode}')

        return {'success': True, 'name': name}

    async def remove(self, path: str = '', **kw: Any) -> dict:
        conda = self.conda_path or shutil.which('conda')
        if not conda:
            raise RuntimeError('conda not found')

        await self.notify('env.opProgress', {'message': f'Removing environment at {path}...'})

        proc = await asyncio.create_subprocess_exec(
            conda, 'env', 'remove', '-p', path, '-y', '--json',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f'conda remove failed with code {proc.returncode}')

        return {'success': True}
