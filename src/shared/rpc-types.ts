export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: JsonRpcError
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: 'notify'
  params: {
    topic: string
    payload: unknown
  }
}

export const RPC_ERRORS = {
  ENV_NOT_FOUND: -32001,
  OP_TIMEOUT: -32002,
  CONDA_NOT_DETECTED: -32003,
  CANCELLED: -32004,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603
} as const

export type RpcMethod =
  | 'ping'
  | 'conda.detect'
  | 'conda.listEnvs'
  | 'conda.create'
  | 'conda.clone'
  | 'conda.remove'
  | 'venv.create'
  | 'env.listPackages'
  | 'env.installPackages'
  | 'env.uninstallPackage'
  | 'env.updatePackages'
  | 'pypi.packageInfo'
  | 'pypi.search'
  | 'jupyter.checkInstalled'
  | 'jupyter.install'
  | 'train.start'
  | 'train.cancel'
  | 'train.status'

export type RpcNotificationTopic =
  | 'env.opProgress'
  | 'jupyter.status'
  | 'train.progress'
  | 'train.done'
  | 'backend.shutdown'
