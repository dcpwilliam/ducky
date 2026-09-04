import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'

export function locateBackend(): { cmd: string; args: string[] } {
  if (is.dev) {
    const pythonCmd = process.env.DUCKY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
    const backendDir = join(app.getAppPath(), 'backend')
    return {
      cmd: pythonCmd,
      args: ['-m', 'ducky_backend']
    }
  }

  const exeName = process.platform === 'win32' ? 'ducky-backend.exe' : 'ducky-backend'
  const exePath = join(process.resourcesPath, 'backend', exeName)

  if (!existsSync(exePath)) {
    throw new Error(`Backend executable not found: ${exePath}`)
  }

  return { cmd: exePath, args: [] }
}
