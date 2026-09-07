import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'

/**
 * Resolve the Python interpreter that runs the backend.
 *
 * Order of preference:
 *  1. DUCKY_PYTHON env var (explicit override).
 *  2. The project's own virtualenv at backend/.venv. This is what makes
 *     inference work: mlx / llama-cpp live here, not in the system Python.
 *  3. A bundled runtime inside the packaged app.
 *  4. Whatever `python3` is on PATH — last resort, may lack dependencies.
 */
function findPython(): string {
  const override = process.env.DUCKY_PYTHON
  if (override) return override

  const isWin = process.platform === 'win32'
  const appPath = app.getAppPath()
  const venvExe = isWin
    ? join(appPath, 'backend', '.venv', 'Scripts', 'python.exe')
    : join(appPath, 'backend', '.venv', 'bin', 'python3')

  if (existsSync(venvExe)) return venvExe

  const bundledPython = getBundledPython()
  if (bundledPython) return bundledPython.exe

  return isWin ? 'python' : 'python3'
}

export function locateBackend(): { cmd: string; args: string[]; env?: Record<string, string> } {
  if (is.dev) {
    return {
      cmd: findPython(),
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
