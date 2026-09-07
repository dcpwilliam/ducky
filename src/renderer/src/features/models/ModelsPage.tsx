import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cpu, Download, Trash2, Send, Square, Loader2, CheckCircle2, AlertCircle,
  Zap, Gauge, RefreshCw, ChevronDown
} from 'lucide-react'
import { clsx } from 'clsx'
import type {
  BackendInfo, LlmStatus, RecommendedModel, ChatMessage
} from '@shared/rpc-types'

type AnyResult = Record<string, unknown>

interface Props {
  onModelChange?: (status: LlmStatus | null) => void
}

export function ModelsPage({ onModelChange }: Props): React.ReactElement {
  const [backend, setBackend] = useState<BackendInfo | null>(null)
  const [status, setStatus] = useState<LlmStatus | null>(null)
  const [models, setModels] = useState<RecommendedModel[]>([])
  const [selected, setSelected] = useState<string>('')
  const [customId, setCustomId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // chat
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [generating, setGenerating] = useState(false)
  const [lastStats, setLastStats] = useState<{
    tokens: number; elapsedMs: number; tokensPerSecond: number
  } | null>(null)

  const [maxTokens, setMaxTokens] = useState(256)
  const [temperature, setTemperature] = useState(0.7)

  const logRef = useRef<HTMLDivElement>(null)

  // ---- load backend info ---------------------------------------------

  const refreshStatus = useCallback(async () => {
    try {
      const st = await window.ducky.llmStatus() as unknown as LlmStatus
      setStatus(st)
      onModelChange?.(st)
    } catch {
      // Backend may still be starting.
    }
  }, [onModelChange])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const info = await window.ducky.llmBackendInfo() as unknown as BackendInfo
        if (cancelled) return
        setBackend(info)
        setModels(info.recommendedModels ?? [])
        if (!selected && info.recommendedModels?.length) {
          setSelected(info.recommendedModels[0].id)
        }
      } catch (err) {
        if (!cancelled) setLoadError(String(err))
      }
      await refreshStatus()
    })()
    return () => { cancelled = true }
  }, [refreshStatus, selected])

  // ---- token streaming ------------------------------------------------

  useEffect(() => {
    const offToken = window.ducky.onLlmToken((data) => {
      setStreaming((prev) => prev + data.text)
    })
    const offDone = window.ducky.onLlmDone((data) => {
      setGenerating(false)
      setStreaming('')
      setMessages((prev) => [...prev, { role: 'assistant', content: data.text }])
      setLastStats({
        tokens: data.completionTokens,
        elapsedMs: data.elapsedMs,
        tokensPerSecond: data.tokensPerSecond
      })
    })
    return () => { offToken(); offDone() }
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  // ---- actions --------------------------------------------------------

  const loadModel = async (): Promise<void> => {
    const modelId = customId.trim() || selected
    if (!modelId) return
    setLoading(true)
    setLoadError(null)
    try {
      await window.ducky.llmLoad(modelId)
      await refreshStatus()
    } catch (err) {
      setLoadError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const unloadModel = async (): Promise<void> => {
    await window.ducky.llmUnload()
    await refreshStatus()
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || generating || !status?.loaded) return
    setInput('')
    setGenerating(true)
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    try {
      await window.ducky.llmGenerateStream({
        messages: [...messages, { role: 'user', content: text }],
        params: { max_tokens: maxTokens, temperature }
      })
    } catch (err) {
      setGenerating(false)
      setMessages((prev) => [
        ...prev, { role: 'assistant', content: `Error: ${err}` }
      ])
    }
  }

  const stop = async (): Promise<void> => {
    await window.ducky.llmCancel()
    setGenerating(false)
  }

  const clearChat = (): void => {
    setMessages([])
    setLastStats(null)
  }

  // ---- render ---------------------------------------------------------

  const model = status?.model

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-3">
        <h1 className="text-base font-semibold text-white mr-auto">Local Models</h1>
        <button onClick={refreshStatus} title="Refresh"
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ---- left: model management ---- */}
        <div className="w-[380px] border-r border-white/5 overflow-y-auto p-4 space-y-4">
          {/* backend */}
          <section className="rounded-lg border border-white/5 bg-surface-1/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Cpu size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-300">Inference backend</span>
            </div>
            {backend ? (
              <div className="space-y-1.5 text-[11.5px]">
                <Row k="engine" v={backend.name} accent={backend.available} />
                <Row k="device" v={backend.device} accent={backend.available} />
                <Row k="chip" v={backend.appleSilicon ? 'Apple Silicon (unified memory)' : 'x86 / other'} />
                <p className="text-slate-500 pt-1 leading-relaxed">{backend.reason}</p>
              </div>
            ) : (
              <div className="text-[11.5px] text-slate-500">Detecting…</div>
            )}
          </section>

          {/* loaded model */}
          <section className="rounded-lg border border-white/5 bg-surface-1/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Gauge size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-300">Loaded model</span>
              {model && (
                <button onClick={unloadModel}
                  className="ml-auto p-1 rounded text-slate-500 hover:text-rose-400"
                  title="Unload and free memory">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            {model ? (
              <div className="space-y-1.5 text-[11.5px]">
                <div className="font-mono text-brand-300 break-all">{model.modelId}</div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Tag>{model.backend}</Tag>
                  <Tag>{model.device}</Tag>
                  {model.paramsB != null && <Tag>{model.paramsB}B</Tag>}
                  {model.quant && <Tag>{model.quant}</Tag>}
                  {status?.activeMemoryGb != null && (
                    <Tag>{status.activeMemoryGb} GB resident</Tag>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-[11.5px] text-slate-500">
                No model loaded. Pick one below.
              </div>
            )}
          </section>

          {/* model picker */}
          <section className="rounded-lg border border-white/5 bg-surface-1/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Download size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-300">Load a model</span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelected(m.id); setCustomId('') }}
                  className={clsx(
                    'w-full text-left rounded-md border px-2.5 py-2 transition-colors',
                    selected === m.id && !customId.trim()
                      ? 'border-brand-500/50 bg-brand-500/10'
                      : 'border-white/5 hover:border-white/10 hover:bg-white/5'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-slate-200 flex-1">{m.name}</span>
                    <span className="text-[10px] text-slate-500">{m.sizeGb} GB</span>
                  </div>
                  <div className="text-[10.5px] text-slate-500 mt-0.5">{m.note}</div>
                </button>
              ))}
            </div>

            <input
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              placeholder="…or any HuggingFace MLX repo id"
              className="mt-2 w-full px-2.5 py-1.5 rounded-md bg-black/30 border border-white/5
                         text-[11.5px] text-slate-200 font-mono outline-none
                         focus:border-brand-500/50 placeholder:text-slate-600"
            />

            <button
              onClick={loadModel}
              disabled={loading || !(customId.trim() || selected)}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md
                         bg-brand-500/20 text-brand-300 text-[12px] hover:bg-brand-500/30
                         disabled:opacity-40"
            >
              {loading ? (
                <><Loader2 size={13} className="animate-spin" /> Downloading &amp; loading…</>
              ) : (
                <><Zap size={13} /> Load model</>
              )}
            </button>

            {loadError && (
              <div className="mt-2 px-2.5 py-2 rounded bg-rose-500/10 border border-rose-500/20
                              text-rose-300 text-[10.5px] leading-relaxed break-words">
                {loadError}
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-600 leading-relaxed">
              First load downloads weights from HuggingFace. If downloads are slow,
              set <code className="text-slate-500">HF_ENDPOINT=https://hf-mirror.com</code>.
            </p>
          </section>
        </div>

        {/* ---- right: chat ---- */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* params */}
          <div className="px-5 py-2.5 border-b border-white/5 flex items-center gap-4">
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              max tokens
              <input
                type="number" value={maxTokens} min={16} max={4096}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-20 px-1.5 py-1 rounded bg-black/30 border border-white/5
                           text-slate-200 text-[11px] outline-none focus:border-brand-500/50"
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              temperature
              <input
                type="number" value={temperature} min={0} max={2} step={0.1}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-16 px-1.5 py-1 rounded bg-black/30 border border-white/5
                           text-slate-200 text-[11px] outline-none focus:border-brand-500/50"
              />
            </label>

            {lastStats && (
              <span className="text-[10.5px] text-slate-500">
                {lastStats.tokensPerSecond} tok/s · {lastStats.tokens} tokens ·{' '}
                {(lastStats.elapsedMs / 1000).toFixed(1)}s
              </span>
            )}

            <button onClick={clearChat}
              className="ml-auto text-[11px] text-slate-500 hover:text-slate-300">
              Clear
            </button>
          </div>

          {/* log */}
          <div ref={logRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {messages.length === 0 && !streaming && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <div className="text-3xl mb-2 opacity-20">🦆</div>
                  <div className="text-slate-500 text-sm">
                    {status?.loaded
                      ? 'Send a message to test the local model'
                      : 'Load a model to start chatting'}
                  </div>
                  {!status?.loaded && (
                    <div className="text-slate-600 text-xs mt-1">
                      Models run fully offline on your GPU
                    </div>
                  )}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}

            {streaming && <Bubble role="assistant" content={streaming} live />}
          </div>

          {/* composer */}
          <div className="px-5 py-3 border-t border-white/5">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                disabled={!status?.loaded}
                placeholder={status?.loaded
                  ? 'Ask something… (Enter to send, Shift+Enter for newline)'
                  : 'Load a model first'}
                rows={2}
                className="flex-1 resize-none px-3 py-2 rounded-lg bg-black/30 border border-white/5
                           text-[13px] text-slate-200 outline-none focus:border-brand-500/50
                           placeholder:text-slate-600 disabled:opacity-50"
              />
              {generating ? (
                <button onClick={stop}
                  className="px-3 py-2 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30">
                  <Square size={15} fill="currentColor" />
                </button>
              ) : (
                <button onClick={send} disabled={!status?.loaded || !input.trim()}
                  className="px-3 py-2 rounded-lg bg-brand-500/20 text-brand-300
                             hover:bg-brand-500/30 disabled:opacity-40">
                  <Send size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- small components -------------------------------------------------

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 w-14 shrink-0">{k}</span>
      <span className={clsx('font-mono', accent ? 'text-emerald-400' : 'text-slate-300')}>
        {v}
      </span>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400 text-[10px]">
      {children}
    </span>
  )
}

function Bubble({ role, content, live }: {
  role: string; content: string; live?: boolean
}): React.ReactElement {
  const isUser = role === 'user'
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={clsx(
        'max-w-[80%] px-3.5 py-2.5 rounded-lg text-[13px] leading-relaxed whitespace-pre-wrap',
        isUser
          ? 'bg-brand-500/15 text-slate-100'
          : 'bg-surface-2/60 text-slate-200 border border-white/5'
      )}>
        {content}
        {live && (
          <span className="inline-block w-1.5 h-3.5 bg-brand-400 animate-pulse ml-0.5 align-middle" />
        )}
      </div>
    </div>
  )
}
