export interface CpuInfo {
  manufacturer: string
  brand: string
  cores: number
  physicalCores: number
  processors: number
}

export interface CpuLoad {
  totalLoad: number
  coreLoads: number[]
}

export interface CpuTemp {
  main: number | null
  cores: (number | null)[]
  available: boolean
}

export interface MemInfo {
  total: number
  used: number
  free: number
  swapTotal: number
  swapUsed: number
  swapFree: number
  percent: number
}

export interface GpuInfo {
  model: string
  vendor: string
  vram: number | null
  vramUsed: number | null
  utilization: number | null
  temperature: number | null
  driver: string
}

export interface TelemetrySample {
  timestamp: number
  cpu: CpuLoad
  cpuTemp: CpuTemp
  memory: MemInfo
  gpus: GpuInfo[]
}
