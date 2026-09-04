import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../../shared/rpc-types'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

export class RpcClient extends EventEmitter {
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffer = ''
  private proc: ChildProcess

  constructor(proc: ChildProcess) {
    super()
    this.proc = proc

    proc.stdout?.setEncoding('utf-8')
    proc.stdout?.on('data', (chunk: string) => {
      this.buffer += chunk
      this.drain()
    })
  }

  private drain(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const msg = JSON.parse(trimmed)
        this.handleMessage(msg)
      } catch {
        console.error('[rpc] invalid JSON:', trimmed)
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse | JsonRpcNotification): void {
    if ('id' in msg && msg.id != null) {
      const pending = this.pending.get(msg.id as number)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(msg.id as number)
        if (msg.error) {
          pending.reject(new Error(`RPC ${msg.error.code}: ${msg.error.message}`))
        } else {
          pending.resolve(msg.result)
        }
      }
    } else if ('method' in msg && msg.method === 'notify') {
      const notif = msg as JsonRpcNotification
      this.emit('notification', notif.params.topic, notif.params.payload)
    }
  }

  async call(method: string, params: Record<string, unknown>, timeoutMs = 30000): Promise<unknown> {
    const id = this.nextId++
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC timeout: ${method} (${timeoutMs}ms)`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer })

      const line = JSON.stringify(request) + '\n'
      this.proc.stdin?.write(line, (err) => {
        if (err) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  isConnected(): boolean {
    return this.proc.exitCode == null
  }
}
