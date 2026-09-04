import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function probeNvidiaSmi(): Promise<{ utilization: number; temperature: number; vramUsed: number; vramTotal: number } | null> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total',
      '--format=csv,noheader,nounits'
    ])
    const parts = stdout.trim().split(',').map((s) => parseFloat(s.trim()))
    if (parts.length >= 4 && parts.every((n) => !isNaN(n))) {
      return {
        utilization: parts[0],
        temperature: parts[1],
        vramUsed: parts[2],
        vramTotal: parts[3]
      }
    }
  } catch {
    // nvidia-smi not available
  }
  return null
}

export async function probeWindowsThermal(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile', '-Command',
      'Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi | Select-Object -First 1 -ExpandProperty CurrentTemperature'
    ])
    const tenths = parseFloat(stdout.trim())
    if (!isNaN(tenths) && tenths > 0) {
      return (tenths - 2732) / 10
    }
  } catch {
    // thermal zone not available
  }
  return null
}
