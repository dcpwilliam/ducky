import { ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import { getMainWindow } from '../index'
import { IPC } from '../../shared/ipc-channels'

interface PtySession {
  proc: ChildProcess
  id: string
}

let sessionCounter = 0

export class PtyManager extends EventEmitter {
  private sessions = new Map<string, PtySession>()

  create(opts: { cols: number; rows: number; cwd?: string; shell?: string; env?: string[] }): string {
    const id = `pty-${++sessionCounter}`
    const shell = opts.shell ?? (process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh')

    const envMap: Record<string, string> = {}
    if (opts.env) {
      for (let i = 0; i < opts.env.length; i += 2) {
        envMap[opts.env[i]] = opts.env[i + 1]
      }
    }

    const proc = spawn(shell, [], {
      cwd: opts.cwd ?? process.env.HOME,
      env: { ...process.env, ...envMap } as Record<string, string>,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    proc.stdout?.on('data', (data: Buffer) => {
      const win = getMainWindow()
      if (win) {
        win.webContents.send(IPC.PTY_DATA, id, data.toString())
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const win = getMainWindow()
      if (win) {
        win.webContents.send(IPC.PTY_DATA, id, data.toString())
      }
    })

    proc.on('exit', () => {
      this.sessions.delete(id)
    })

    this.sessions.set(id, { proc, id })
    return id
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (session?.proc.stdin) {
      session.proc.stdin.write(data)
    }
  }

  resize(_id: string, _cols: number, _rows: number): void {
    // No-op without node-pty; terminal resize is best-effort
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.proc.kill()
      this.sessions.delete(id)
    }
  }

  killAll(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
  }
}
