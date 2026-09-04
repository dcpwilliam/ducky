export interface PolicyFile {
  schemaVersion: number
  specHash: string
  obsDim: number
  actDim: number
  obsNorm: { mean: number[]; std: number[] }
  actScale: number[]
  layers: PolicyLayer[]
  metadata?: Record<string, unknown>
}

export interface PolicyLayer {
  W: number[]
  b: number[]
  act: 'tanh' | 'relu' | 'linear'
}

export interface SimFrame {
  timestamp: number
  rootPos: [number, number, number]
  rootQuat: [number, number, number, number]
  jointAngles: number[]
  targetPos: [number, number, number] | null
  contacts: boolean[]
}

export interface SimTelemetry {
  timestamp: number
  position: { x: number; y: number; z: number }
  velocity: { x: number; y: number; z: number }
  obsVector: number[]
  actions: number[]
  reward: number
  episodeReward: number
  episodeLength: number
  jointTargets: number[]
}

export interface SimCommand {
  type: 'init' | 'start' | 'stop' | 'tick' | 'setTarget' | 'addObstacle' | 'removeObstacle' | 'setTerrain' | 'pause' | 'resume' | 'step' | 'reset' | 'setSpeed' | 'loadPolicy'
  payload?: unknown
  speed?: number
  policy?: PolicyFile
}

export interface SimEvent {
  type: 'fall' | 'reachedTarget' | 'episodeEnd'
  data?: Record<string, unknown>
}

export interface TrainingProgress {
  iteration: number
  totalIterations: number
  meanReward: number
  kl: number
  entropy: number
  episodeLength: number
}

export interface TrainingResult {
  policyPath: string
  finalReward: number
  iterations: number
}
