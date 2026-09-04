import logging
from typing import Any, Callable, Awaitable, Optional

logger = logging.getLogger('ducky.dispatcher')

MethodHandler = Callable[..., Awaitable[Any]]


class Dispatcher:
    def __init__(self) -> None:
        self._methods: dict[str, MethodHandler] = {}

    def register(self, name: str, handler: MethodHandler) -> None:
        self._methods[name] = handler
        logger.debug('Registered method: %s', name)

    async def handle(self, msg: dict) -> Optional[dict]:
        method = msg.get('method')
        req_id = msg.get('id')
        params = msg.get('params', {})

        if method == 'notify':
            return None

        handler = self._methods.get(method)
        if handler is None:
            if req_id is not None:
                return {
                    'jsonrpc': '2.0',
                    'id': req_id,
                    'error': {
                        'code': -32601,
                        'message': f'Method not found: {method}'
                    }
                }
            return None

        try:
            result = await handler(**(params if isinstance(params, dict) else {}))
            if req_id is not None:
                return {
                    'jsonrpc': '2.0',
                    'id': req_id,
                    'result': result
                }
        except Exception as e:
            logger.error('Method %s failed: %s', method, e, exc_info=True)
            if req_id is not None:
                return {
                    'jsonrpc': '2.0',
                    'id': req_id,
                    'error': {
                        'code': -32603,
                        'message': str(e)
                    }
                }

        return None
