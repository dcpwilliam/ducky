import { BrowserWindow } from 'electron'
import si from 'systeminformation'
import { IPC } from '../../shared/ipc-channels'
import type { TelemetrySample, CpuInfo, CpuLoad, CpuTemp, MemInfo, GpuInfo } from '../../shared/monitor-types'

const RING_SIZE = 300
const POLL_INTERVAL = 1000

export class MonitorService {
  private timer: NodeJS.Timeout | null = null
  private ring: TelemetrySample[] = []
  private ringIndex = 0
  private cpuInfo: CpuInfo | null = null
  private win: BrowserWindow

  constructor(win: BrowserWindow) {
    this.win = win
  }

  async start(): Promise<void> {
    const cpu = await si.cpu()
    this.cpuInfo = {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      processors: cpu.processors
    }

    this.timer = setInterval(() => this.poll(), POLL_INTERVAL)
    await this.poll()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async poll(): Promise<void> {
    try {
      const [load, mem, graphics, temp] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.graphics(),
        this.safeTemp()
      ])

      const sample: TelemetrySample = {
        timestamp: Date.now(),
        cpu: {
          totalLoad: load.currentLoad,
          coreLoads: load.cpus.map((c) => c.load)
        },
        cpuTemp: {
          main: temp.main,
          cores: temp.cores,
          available: temp.available
        },
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
          swapTotal: mem.swaptotal,
          swapUsed: mem.swapused,
          swapFree: mem.swapused > 0 ? mem.swaptotal - mem.swapused : mem.swaptotal,
          percent: mem.total > 0 ? (mem.used / mem.total) * 100 : 0
        },
        gpus: graphics.controllers.map((c) => ({
          model: c.model,
          vendor: c.vendor,
          vram: c.vram ?? null,
          vramUsed: c.memoryUsed ?? null,
          utilization: c.utilizationGpu ?? null,
          temperature: c.temperatureGpu ?? null,
          driver: c.driverVersion ?? ''
        }))
      }

      if (this.ring.length < RING_SIZE) {
        this.ring.push(sample)
      } else {
        this.ring[this.ringIndex] = sample
      }
      this.ringIndex = (this.ringIndex + 1) % RING_SIZE

      this.win.webContents.send(IPC.MONITOR_TELEMETRY, sample)
    } catch (err) {
      console.error('[monitor] poll error:', err)
    }
  }

  private async safeTemp(): Promise<CpuTemp> {
    try {
      const t = await si.cpuTemperature()
      return {
        main: t.main > 0 ? t.main : null,
        cores: t.cores?.map((c) => (c > 0 ? c : null)) ?? [],
        available: t.main > 0
      }
    } catch {
      return { main: null, cores: [], available: false }
    }
  }

  getSnapshot(): { cpuInfo: CpuInfo | null; ring: TelemetrySample[] } {
    return { cpuInfo: this.cpuInfo, ring: [...this.ring] }
  }
}
