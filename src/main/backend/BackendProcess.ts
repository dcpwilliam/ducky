import { ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import { join } from 'path'
import { app } from 'electron'
import { RpcClient } from './RpcClient'
import { locateBackend } from './locate'
import { getMainWindow } from '../index'
import { IPC } from '../../shared/ipc-channels'
import { is } from '@electron-toolkit/utils'

export interface BackendStatus {
  connected: boolean
  pid: number | null
  restartCount: number
}

/**
 * Environment tweaks for HuggingFace model downloads.
 *
 * Xet (the chunked CAS backend huggingface_hub enables by default) fails with
 * 401 against public mirrors, so we disable it unless the user opted in.
 *
 * The official HF endpoint is often unreachable from restricted networks, so in
 * dev we default to the hf-mirror.com mirror. Both values remain overridable
 * from the shell via HF_ENDPOINT / DUCKY_HF_MIRROR (production keeps the
 * official endpoint unless explicitly overridden).
 */
function huggingFaceEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  if (!process.env.HF_HUB_DISABLE_XET) {
    env.HF_HUB_DISABLE_XET = '1'
  }
  if (!process.env.HF_ENDPOINT) {
    if (process.env.DUCKY_HF_MIRROR) {
      env.HF_ENDPOINT = process.env.DUCKY_HF_MIRROR
    } else if (!app.isPackaged) {
      env.HF_ENDPOINT = 'https://hf-mirror.com'
    }
  }
  return env
}

/**
 * Per-method RPC timeouts.
 *
 * The 30s default is far too short for model work: loading a model may involve
 * downloading several GB from HuggingFace, and a notebook cell can legitimately
 * run a training loop. Those calls get generous budgets; everything else keeps
 * the short default so a wedged backend surfaces quickly.
 */
function timeoutForMethod(method: string): number {
  if (method.startsWith('llm.load')) return 20 * 60 * 1000      // includes download
  if (method.startsWith('llm.generate')) return 10 * 60 * 1000   // long generations
  if (method.startsWith('kernel.execute')) return 30 * 60 * 1000 // training cells
  if (method.startsWith('train.')) return 60 * 60 * 1000
  if (method.startsWith('env.install') || method.startsWith('env.update')) {
    return 10 * 60 * 1000
  }
  return 30 * 1000
}

export class BackendProcess extends EventEmitter {
  private process: ChildProcess | null = null
  private rpc: RpcClient | null = null
  private restartCount = 0
  private maxRestarts = 3
  private restartDelay = 1000
  private stopping = false

  async start(): Promise<void> {
    const exe = locateBackend()
    this.spawnProcess(exe.cmd, exe.args, exe.env)
  }

  private async spawnProcess(cmd: string, args: string[], envOverrides?: Record<string, string>): Promise<void> {
    const backendDir = join(app.getAppPath(), 'backend')

    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      PYTHONHOME: undefined,
      PYTHONPATH: backendDir,
      ...huggingFaceEnv()
    }

    if (envOverrides) {
      Object.assign(spawnEnv, envOverrides)
      if (envOverrides['PYTHONPATH'] === '') {
        spawnEnv['PYTHONPATH'] = backendDir
      } else if (envOverrides['PYTHONPATH']) {
        spawnEnv['PYTHONPATH'] = `${backendDir}:${envOverrides['PYTHONPATH']}`
      }
    }

    this.process = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv
    })

    this.rpc = new RpcClient(this.process)

    this.rpc.on('notification', (topic: string, payload: unknown) => {
      const win = getMainWindow()
      if (win) {
        win.webContents.send(IPC.BACKEND_NOTIFICATION, { topic, payload })
      }
    })

    this.process.on('exit', (code) => {
      if (!this.stopping) {
        this.handleCrash(code)
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[backend stderr]', data.toString().trim())
    })

    try {
      await this.rpc.call('ping', {}, 10000)
      this.restartCount = 0
      this.emit('statusChange', this.getStatus())
    } catch {
      console.error('[backend] ping failed after spawn')
      this.handleCrash(1)
    }
  }

  private async handleCrash(code: number | null): Promise<void> {
    if (this.restartCount >= this.maxRestarts) {
      console.error('[backend] max restarts reached, giving up')
      this.emit('statusChange', this.getStatus())
      return
    }

    this.restartCount++
    const delay = this.restartDelay * Math.pow(2, this.restartCount - 1)
    console.warn(`[backend] crashed (code=${code}), restarting in ${delay}ms (attempt ${this.restartCount}/${this.maxRestarts})`)

    this.emit('statusChange', this.getStatus())

    setTimeout(() => {
      if (!this.stopping) {
        const exe = locateBackend()
        this.spawnProcess(exe.cmd, exe.args, exe.env)
      }
    }, delay)
  }

  async invoke(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.rpc) throw new Error('Backend not connected')
    return this.rpc.call(method, params ?? {}, timeoutForMethod(method))
  }

  getStatus(): BackendStatus {
    return {
      connected: this.rpc?.isConnected() ?? false,
      pid: this.process?.pid ?? null,
      restartCount: this.restartCount
    }
  }

  stop(): void {
    this.stopping = true
    if (this.process) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], { stdio: 'ignore' })
        } else {
          this.process.kill('SIGTERM')
        }
      } catch {
        // process may already be dead
      }
      this.process = null
      this.rpc = null
    }
  }
}
