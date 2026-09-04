import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const execFileAsync = promisify(execFile)

const COMMON_CONDA_PATHS = process.platform === 'win32'
  ? [
      join(homedir(), 'anaconda3'),
      join(homedir(), 'miniconda3'),
      join(homedir(), 'mambaforge'),
      'C:\\ProgramData\\anaconda3',
      'C:\\ProgramData\\miniconda3'
    ]
  : [
      join(homedir(), 'anaconda3'),
      join(homedir(), 'miniconda3'),
      join(homedir(), 'mambaforge'),
      '/opt/anaconda3',
      '/opt/miniconda3',
      '/opt/homebrew/anaconda3'
    ]

export async function detectConda(): Promise<{ path: string; version: string } | null> {
  // Try PATH first
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(cmd, ['conda'])
    const condaPath = stdout.trim().split('\n')[0].trim()
    if (condaPath && existsSync(condaPath)) {
      const version = await getCondaVersion(condaPath)
      return { path: condaPath, version }
    }
  } catch {
    // not in PATH
  }

  // Try Windows registry
  if (process.platform === 'win32') {
    const fromReg = await detectFromRegistry()
    if (fromReg) return fromReg
  }

  // Try common paths
  for (const dir of COMMON_CONDA_PATHS) {
    const condaExe = process.platform === 'win32'
      ? join(dir, 'Scripts', 'conda.exe')
      : join(dir, 'bin', 'conda')

    if (existsSync(condaExe)) {
      const version = await getCondaVersion(condaExe)
      return { path: condaExe, version }
    }

    const condaSimple = join(dir, 'conda')
    if (existsSync(condaSimple)) {
      const version = await getCondaVersion(condaSimple)
      return { path: condaSimple, version }
    }
  }

  return null
}

async function getCondaVersion(condaPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(condaPath, ['--version'])
    return stdout.trim()
  } catch {
    return 'unknown'
  }
}

async function detectFromRegistry(): Promise<{ path: string; version: string } | null> {
  const keys = [
    'HKCU\\Software\\Python\\ContinuumAnalytics\\Anaconda3\\InstallPath',
    'HKCU\\Software\\Python\\ContinuumAnalytics\\Miniconda3\\InstallPath',
    'HKLM\\Software\\Python\\ContinuumAnalytics\\Anaconda3\\InstallPath'
  ]

  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync('reg', ['query', key, '/ve'])
      const match = stdout.match(/REG_SZ\s+(.+)/)
      if (match) {
        const installPath = match[1].trim()
        const condaExe = join(installPath, 'Scripts', 'conda.exe')
        if (existsSync(condaExe)) {
          const version = await getCondaVersion(condaExe)
          return { path: condaExe, version }
        }
      }
    } catch {
      // key doesn't exist
    }
  }

  return null
}
