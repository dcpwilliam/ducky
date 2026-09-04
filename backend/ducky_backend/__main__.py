import asyncio
import sys
import json
import signal
import logging
import os

from ducky_backend.protocol.jsonrpc import JsonRpcHandler
from ducky_backend.protocol.dispatcher import Dispatcher
from ducky_backend.services.conda_service import CondaService
from ducky_backend.services.venv_service import VenvService
from ducky_backend.services.pip_service import PipService
from ducky_backend.services.pypi_service import PypiService
from ducky_backend.services.jupyter_service import JupyterService
from ducky_backend.services.training_service import TrainingService

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger('ducky')


async def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stdin.reconfigure(encoding='utf-8')

    dispatcher = Dispatcher()
    handler = JsonRpcHandler(
        reader=sys.stdin,
        writer=sys.stdout,
        dispatcher=dispatcher
    )

    conda = CondaService(handler.send_notification)
    venv = VenvService(handler.send_notification)
    pip = PipService(handler.send_notification)
    pypi = PypiService()
    jupyter = JupyterService(handler.send_notification)
    training = TrainingService(handler.send_notification)

    async def ping_handler(**kwargs):
        return {'status': 'ok', 'pid': os.getpid()}

    dispatcher.register('ping', ping_handler)

    dispatcher.register('conda.detect', conda.detect)
    dispatcher.register('conda.listEnvs', conda.list_envs)
    dispatcher.register('conda.create', conda.create)
    dispatcher.register('conda.clone', conda.clone)
    dispatcher.register('conda.remove', conda.remove)

    dispatcher.register('venv.create', venv.create)

    dispatcher.register('env.listPackages', pip.list_packages)
    dispatcher.register('env.installPackages', pip.install)
    dispatcher.register('env.uninstallPackage', pip.uninstall)
    dispatcher.register('env.updatePackages', pip.update)

    dispatcher.register('pypi.packageInfo', pypi.package_info)
    dispatcher.register('pypi.search', pypi.search)

    dispatcher.register('jupyter.checkInstalled', jupyter.check_installed)
    dispatcher.register('jupyter.install', jupyter.install)

    dispatcher.register('train.start', training.start)
    dispatcher.register('train.cancel', training.cancel)
    dispatcher.register('train.status', training.status)

    logger.info('Ducky backend starting (PID %d)', os.getpid())

    shutdown_event = asyncio.Event()

    def handle_signal():
        logger.info('Shutdown signal received')
        shutdown_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            pass

    try:
        await asyncio.gather(
            handler.run(),
            shutdown_event.wait()
        )
    except asyncio.CancelledError:
        pass
    finally:
        await handler.close()
        logger.info('Backend shutdown complete')


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
