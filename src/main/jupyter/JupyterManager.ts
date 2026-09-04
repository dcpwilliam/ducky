import { ChildProcess, spawn } from 'child_process'
import { getMainWindow } from '../index'
import { IPC } from '../../shared/ipc-channels'
import { randomBytes } from 'crypto'

interface JupyterServer {
  process: ChildProcess
  url: string
  token: string
  port: number
  envPath: string
}

export class JupyterManager {
  private server: JupyterServer | null = null

  async start(envPath: string): Promise<{ url: string; token: string; port: number }> {
    if (this.server) {
      this.stop()
    }

    const token = randomBytes(24).toString('hex')
    const port = await this.findFreePort()

    let pythonExe: string
    if (envPath === 'default' || !envPath) {
      pythonExe = process.platform === 'win32' ? 'python' : 'python3'
    } else {
      pythonExe = process.platform === 'win32'
        ? `${envPath}\\Scripts\\python.exe`
        : `${envPath}/bin/python`
    }

    const serverProc = spawn(pythonExe, [
      '-m', 'jupyter', 'lab',
      '--no-browser',
      `--port=${port}`,
      `--ServerApp.token=${token}`,
      '--ServerApp.disable_check_xsrf=False',
      '--ServerApp.allow_origin=*',
      `--ServerApp.root_dir=${process.env.HOME}`
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    const url = `http://localhost:${port}/lab?token=${token}`

    this.server = {
      process: serverProc,
      url,
      token,
      port,
      envPath
    }

    serverProc.on('exit', (code) => {
      console.log(`[jupyter] exited with code ${code}`)
      this.server = null
      const win = getMainWindow()
      if (win) {
        win.webContents.send(IPC.JUPYTER_STATUS, { running: false, url: null })
      }
    })

    const win = getMainWindow()
    if (win) {
      win.webContents.send(IPC.JUPYTER_STATUS, { running: true, url })
    }

    return { url, token, port }
  }

  stop(): void {
    if (this.server) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(this.server.process.pid), '/T', '/F'], { stdio: 'ignore' })
        } else {
          this.server.process.kill('SIGTERM')
        }
      } catch {
        // process may already be dead
      }
      this.server = null
    }
  }

  getStatus(): { running: boolean; url: string | null; envPath?: string } {
    if (!this.server) return { running: false, url: null }
    return { running: true, url: this.server.url, envPath: this.server.envPath }
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const { createServer } = require('net')
      const server = createServer()
      server.listen(0, () => {
        const port = (server.address() as any).port
        server.close(() => resolve(port))
      })
      server.on('error', reject)
    })
  }
}
