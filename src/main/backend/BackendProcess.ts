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
      PYTHONPATH: backendDir
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
    return this.rpc.call(method, params ?? {})
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
