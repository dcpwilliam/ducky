import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'

export function locateBackend(): { cmd: string; args: string[]; env?: Record<string, string> } {
  if (is.dev) {
    const pythonCmd = process.env.DUCKY_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
    return {
      cmd: pythonCmd,
      args: ['-m', 'ducky_backend']
    }
  }

  const bundledPython = getBundledPython()
  if (bundledPython) {
    return {
      cmd: bundledPython.exe,
      args: ['-m', 'ducky_backend'],
      env: bundledPython.env
    }
  }

  const exeName = process.platform === 'win32' ? 'ducky-backend.exe' : 'ducky-backend'
  const exePath = join(process.resourcesPath, 'backend', exeName)

  if (!existsSync(exePath)) {
    throw new Error(`Backend executable not found: ${exePath}`)
  }

  return { cmd: exePath, args: [] }
}

function getBundledPython(): { exe: string; env: Record<string, string> } | null {
  const pythonDir = join(process.resourcesPath, 'python')
  if (!existsSync(pythonDir)) {
    return null
  }

  const isWin = process.platform === 'win32'
  const exePath = isWin
    ? join(pythonDir, 'python', 'python.exe')
    : join(pythonDir, 'python', 'bin', 'python3')

  if (!existsSync(exePath)) {
    return null
  }

  const home = join(pythonDir, 'python')
  const lib = isWin
    ? join(home, 'Lib')
    : join(home, 'lib')

  return {
    exe: exePath,
    env: {
      PYTHONHOME: home,
      PYTHONPATH: '',
      PATH: isWin
        ? `${home};${home}\\Scripts;${process.env.PATH ?? ''}`
        : `${join(home, 'bin')}:${process.env.PATH ?? ''}`
    }
  }
}
