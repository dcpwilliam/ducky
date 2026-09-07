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
from ducky_backend.services.llm_service import LLMService
from ducky_backend.services.kernel_service import KernelService

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

    # LLM owns inference; the notebook kernel depends on it so cells can call
    # the loaded model directly.
    llm = LLMService(handler.send_notification)
    kernel = KernelService(handler.send_notification, llm_service=llm)
    kernel.bind_loop(asyncio.get_event_loop())

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

    # Local LLM inference
    dispatcher.register('llm.backendInfo', llm.backend_info)
    dispatcher.register('llm.listModels', llm.list_models)
    dispatcher.register('llm.load', llm.load_model)
    dispatcher.register('llm.unload', llm.unload_model)
    dispatcher.register('llm.status', llm.status)
    dispatcher.register('llm.generate', llm.generate)
    dispatcher.register('llm.generateStream', llm.generate_stream)
    dispatcher.register('llm.cancel', llm.cancel)
    dispatcher.register('llm.countTokens', llm.count_tokens)

    # Notebook kernel
    dispatcher.register('kernel.createSession', kernel.create_session)
    dispatcher.register('kernel.deleteSession', kernel.delete_session)
    dispatcher.register('kernel.listSessions', kernel.list_sessions)
    dispatcher.register('kernel.execute', kernel.execute)
    dispatcher.register('kernel.interrupt', kernel.interrupt)
    dispatcher.register('kernel.variables', kernel.variables)
    dispatcher.register('kernel.setVariable', kernel.set_variable)
    dispatcher.register('kernel.deleteVariable', kernel.delete_variable)

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
        # Release model memory and stop cell workers before exiting.
        kernel.shutdown()
        llm.shutdown()
        await handler.close()
        logger.info('Backend shutdown complete')


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
