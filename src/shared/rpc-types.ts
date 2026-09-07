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
  | 'llm.backendInfo'
  | 'llm.listModels'
  | 'llm.load'
  | 'llm.unload'
  | 'llm.status'
  | 'llm.generate'
  | 'llm.generateStream'
  | 'llm.cancel'
  | 'llm.countTokens'
  | 'kernel.createSession'
  | 'kernel.deleteSession'
  | 'kernel.listSessions'
  | 'kernel.execute'
  | 'kernel.interrupt'
  | 'kernel.variables'
  | 'kernel.setVariable'
  | 'kernel.deleteVariable'

export type RpcNotificationTopic =
  | 'env.opProgress'
  | 'jupyter.status'
  | 'train.progress'
  | 'train.done'
  | 'backend.shutdown'
  | 'llm.start'
  | 'llm.token'
  | 'llm.done'
  | 'llm.error'
  | 'llm.status'
  | 'kernel.stream'
  | 'kernel.status'

// ---- LLM types -------------------------------------------------------

export type InferenceBackend = 'mlx' | 'llamacpp' | 'none'
export type InferenceDevice = 'apple-silicon-gpu' | 'metal' | 'cuda' | 'cpu'

export interface BackendInfo {
  name: InferenceBackend
  device: InferenceDevice
  available: boolean
  reason: string
  appleSilicon: boolean
  recommendedModels: RecommendedModel[]
  detail?: Record<string, unknown>
}

export interface RecommendedModel {
  id: string
  name: string
  paramsB: number
  quant: string
  sizeGb: number
  note: string
}

export interface ModelStatus {
  modelId: string
  backend: InferenceBackend
  device: InferenceDevice
  loaded: boolean
  paramsB: number | null
  quant: string | null
  memoryGb: number | null
  contextTokens: number | null
}

export interface LlmStatus {
  loaded: boolean
  model: ModelStatus | null
  backend: BackendInfo
  generating: boolean
  activeMemoryGb?: number
}

export interface GenerateParams {
  max_tokens?: number
  temperature?: number
  top_p?: number
  repetition_penalty?: number
  seed?: number | null
  stop?: string[]
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface GenerateResult {
  jobId: string
  text: string
  cancelled: boolean
  promptTokens: number
  completionTokens: number
  elapsedMs: number
  tokensPerSecond: number
  error?: string
}

// ---- Notebook kernel types -------------------------------------------

export type CellType = 'code' | 'markdown'
export type CellStatus = 'idle' | 'running' | 'ok' | 'error' | 'aborted'

export interface CellOutput {
  type: 'stdout' | 'stderr' | 'text' | 'json' | 'rich'
  text?: string
  data?: unknown
  mime?: string
}

export interface CellError {
  ename: string
  evalue: string
  traceback: string[]
}

export interface Cell {
  id: string
  type: CellType
  source: string
  outputs: CellOutput[]
  error: CellError | null
  status: CellStatus
  executionCount: number | null
  elapsedMs: number | null
  collapsed: boolean
}

export interface KernelSession {
  id: string
  name: string
  executionCount: number
  busy: boolean
  createdAt: number
  variables: KernelVariable[]
}

export interface KernelVariable {
  name: string
  type: string
  repr: string
}

export interface ExecuteResult {
  cellId: string
  sessionId: string
  status: CellStatus
  executionCount: number
  outputs: CellOutput[]
  elapsedMs: number
  error?: CellError
}
