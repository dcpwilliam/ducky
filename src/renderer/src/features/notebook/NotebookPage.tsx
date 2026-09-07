import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play, Square, Plus, Trash2, RotateCw, Save, FolderOpen, ChevronRight,
  Cpu, Sparkles, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import type {
  Cell, CellOutput, ExecuteResult, KernelVariable
} from '@shared/rpc-types'
import { CellView } from './CellView'

type AnyResult = Record<string, unknown>

const newId = (): string => Math.random().toString(36).slice(2, 10)

function makeCell(type: 'code' | 'markdown' = 'code', source = ''): Cell {
  return {
    id: newId(),
    type,
    source,
    outputs: [],
    error: null,
    status: 'idle',
    executionCount: null,
    elapsedMs: null,
    collapsed: false
  }
}

/** Starter notebook: a working agent-debugging walkthrough. */
function starterCells(): Cell[] {
  return [
    makeCell('markdown',
      '# Agent debugging\n\nCells run in a kernel that already has the local model bound to `llm`.'),
    makeCell('code',
      'llm   # shows which model is loaded, if any'),
    makeCell('code',
      '# Load a small model (downloads on first use)\n'
      + 'load_model("mlx-community/Qwen2.5-0.5B-Instruct-4bit")'),
    makeCell('markdown', '## Define tools'),
    makeCell('code',
      'def multiply(a, b):\n'
      + '    """Multiply two numbers."""\n'
      + '    return float(a) * float(b)\n\n'
      + 'def word_count(text):\n'
      + '    """Count words in text."""\n'
      + '    return len(text.split())'),
    makeCell('markdown',
      '## Build an agent and step through it\n\n'
      + 'Call `agent.step()` one at a time to inspect its reasoning.'),
    makeCell('code',
      'agent = Agent(\n'
      + '    llm,\n'
      + '    tools=[\n'
      + '        Tool("multiply", "Multiply two numbers", multiply),\n'
      + '        Tool("word_count", "Count words in text", word_count),\n'
      + '    ],\n'
      + '    max_steps=4,\n'
      + ')\n'
      + 'agent.reset("What is 17 times 25?")'),
    makeCell('code',
      '# Run one step at a time and inspect the result\n'
      + 'agent.step()   # returns a Step: thought / action / observation'),
    makeCell('code',
      '# Finish the run; the whole trace stays available\n'
      + 'agent.run(verbose=True)\n'
      + 'agent'),
    makeCell('markdown',
      '## Inspect the trace\n\n'
      + '`agent.trace` holds every step, so you can see exactly what the model saw.'),
    makeCell('code',
      'table([\n'
      + '    {"step": s.index, "action": s.action or "FINAL",\n'
      + '     "input": str(s.action_input)[:40],\n'
      + '     "observation": str(s.observation)[:60],\n'
      + '     "ms": s.elapsed_ms}\n'
      + '    for s in agent.trace\n'
      + '])'),
  ]
}

export function NotebookPage(): React.ReactElement {
  const [cells, setCells] = useState<Cell[]>(starterCells)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [variables, setVariables] = useState<KernelVariable[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showVars, setShowVars] = useState(true)

  // Live stdout/stderr for the cell currently executing.
  const streamBuf = useRef<Record<string, CellOutput[]>>({})

  // ---- session bootstrap --------------------------------------------

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const sess = await window.ducky.kernelCreateSession('Notebook') as AnyResult
        if (cancelled) return
        setSessionId(String(sess.id))
        setSessionReady(true)
      } catch (err) {
        setError(`Failed to start kernel: ${err}`)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ---- notifications -------------------------------------------------

  useEffect(() => {
    if (!sessionId) return

    const offStream = window.ducky.onKernelStream((data) => {
      if (data.sessionId !== sessionId) return
      const buf = streamBuf.current[data.cellId] ??= []
      const last = buf[buf.length - 1]
      if (last && last.type === data.stream) {
        last.text = (last.text ?? '') + data.text
      } else {
        buf.push({ type: data.stream, text: data.text })
      }
      // Reflect streaming text into the cell so output appears live.
      setCells((prev) => prev.map((c) => (
        c.id === data.cellId ? { ...c, outputs: [...buf] } : c
      )))
    })

    const offStatus = window.ducky.onKernelStatus((data) => {
      if (data.sessionId !== sessionId) return
      if (data.status === 'running') {
        setCells((prev) => prev.map((c) => (
          c.id === data.cellId ? { ...c, status: 'running' } : c
        )))
      }
    })

    return () => { offStream(); offStatus() }
  }, [sessionId])

  // ---- execution ------------------------------------------------------

  const refreshVariables = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await window.ducky.kernelVariables(sessionId) as AnyResult
      setVariables((res.variables as KernelVariable[]) ?? [])
    } catch {
      // Variable inspection is non-critical.
    }
  }, [sessionId])

  const runCell = useCallback(async (id: string, advance: boolean) => {
    if (!sessionId || busy) return
    const cell = cells.find((c) => c.id === id)
    if (!cell || cell.type !== 'code') return
    if (!cell.source.trim()) {
      if (advance) focusNext(id)
      return
    }

    streamBuf.current[id] = []
    setCells((prev) => prev.map((c) => (
      c.id === id
        ? { ...c, status: 'running', outputs: [], error: null, elapsedMs: null }
        : c
    )))
    setBusy(true)

    try {
      const result = await window.ducky.kernelExecute(
        sessionId, cell.source, id
      ) as unknown as ExecuteResult

      setCells((prev) => prev.map((c) => (
        c.id === id
          ? {
              ...c,
              status: result.status,
              outputs: result.outputs ?? [],
              error: result.error ?? null,
              executionCount: result.executionCount ?? null,
              elapsedMs: result.elapsedMs ?? null
            }
          : c
      )))
    } catch (err) {
      const message = String(err)
      setCells((prev) => prev.map((c) => (
        c.id === id
          ? {
              ...c,
              status: 'error',
              error: { ename: 'Error', evalue: message, traceback: [message] },
              outputs: []
            }
          : c
      )))
    } finally {
      delete streamBuf.current[id]
      setBusy(false)
      await refreshVariables()
      if (advance) focusNext(id)
    }
  }, [sessionId, cells, busy, refreshVariables])

  const focusNext = (id: string): void => {
    const idx = cells.findIndex((c) => c.id === id)
    const next = cells[idx + 1]
    if (next) {
      setSelectedId(next.id)
    } else {
      const created = makeCell('code')
      setCells((prev) => [...prev, created])
      setSelectedId(created.id)
    }
  }

  const runAll = async (): Promise<void> => {
    if (!sessionId || busy) return
    setBusy(true)
    try {
      const codeCells = cells.filter((c) => c.type === 'code' && c.source.trim())
      for (const cell of codeCells) {
        setSelectedId(cell.id)
        streamBuf.current[cell.id] = []
        setCells((prev) => prev.map((c) => (
          c.id === cell.id
            ? { ...c, status: 'running', outputs: [], error: null }
            : c
        )))

        try {
          const result = await window.ducky.kernelExecute(
            sessionId, cell.source, cell.id
          ) as unknown as ExecuteResult
          setCells((prev) => prev.map((c) => (
            c.id === cell.id
              ? {
                  ...c,
                  status: result.status,
                  outputs: result.outputs ?? [],
                  error: result.error ?? null,
                  executionCount: result.executionCount ?? null,
                  elapsedMs: result.elapsedMs ?? null
                }
              : c
          )))
          if (result.status === 'error') break
        } catch (err) {
          setCells((prev) => prev.map((c) => (
            c.id === cell.id
              ? {
                  ...c,
                  status: 'error',
                  error: { ename: 'Error', evalue: String(err), traceback: [] },
                  outputs: []
                }
              : c
          )))
          break
        } finally {
          delete streamBuf.current[cell.id]
        }
      }
    } finally {
      setBusy(false)
      await refreshVariables()
    }
  }

  const interrupt = async (): Promise<void> => {
    if (!sessionId) return
    await window.ducky.kernelInterrupt(sessionId)
    setBusy(false)
    setCells((prev) => prev.map((c) => (
      c.status === 'running' ? { ...c, status: 'aborted' } : c
    )))
  }

  const restart = async (): Promise<void> => {
    if (sessionId) {
      try { await window.ducky.kernelDeleteSession(sessionId) } catch { /* gone */ }
    }
    const sess = await window.ducky.kernelCreateSession('Notebook') as AnyResult
    setSessionId(String(sess.id))
    setVariables([])
    setCells((prev) => prev.map((c) => ({
      ...c, outputs: [], error: null, status: 'idle' as const,
      executionCount: null, elapsedMs: null
    })))
  }

  // ---- cell editing ---------------------------------------------------

  const patchCell = (id: string, patch: Partial<Cell>): void => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const deleteCell = (id: string): void => {
    setCells((prev) => {
      if (prev.length === 1) return [makeCell('code')]
      return prev.filter((c) => c.id !== id)
    })
  }

  const moveCell = (id: string, dir: -1 | 1): void => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id)
      const target = idx + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const insertBelow = (id: string, type: 'code' | 'markdown'): void => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id)
      const created = makeCell(type)
      const next = [...prev]
      next.splice(idx + 1, 0, created)
      return next
    })
  }

  const addCell = (type: 'code' | 'markdown'): void => {
    const created = makeCell(type)
    setCells((prev) => [...prev, created])
    setSelectedId(created.id)
  }

  // ---- persistence ----------------------------------------------------

  const save = async (): Promise<void> => {
    const doc = {
      version: 1,
      kind: 'ducky-notebook',
      cells: cells.map((c) => ({
        type: c.type,
        source: c.source,
        executionCount: c.executionCount
      }))
    }
    const result = await window.ducky.saveDialog({
      filters: [{ name: 'Ducky Notebook', extensions: ['ipynb'] }],
      defaultPath: 'notebook.ipynb'
    }) as AnyResult
    if (result.canceled || !result.filePath) return
    await window.ducky.writeFile(String(result.filePath), JSON.stringify(doc, null, 2))
  }

  const open = async (): Promise<void> => {
    const result = await window.ducky.openDialog({
      filters: [{ name: 'Notebooks', extensions: ['ipynb', 'json'] }],
      properties: ['openFile']
    }) as { canceled: boolean; filePaths?: string[] }
    if (result.canceled || !result.filePaths?.[0]) return
    const text = await window.ducky.readFile(String(result.filePaths[0])) as string
    try {
      const doc = JSON.parse(text)
      const loaded: Cell[] = (doc.cells ?? []).map((c: AnyResult) => {
        const cell = makeCell((c.type as 'code' | 'markdown') ?? 'code',
                              String(c.source ?? ''))
        cell.executionCount = (c.executionCount as number) ?? null
        return cell
      })
      if (loaded.length) setCells(loaded)
    } catch (err) {
      setError(`Could not open notebook: ${err}`)
    }
  }

  // ---- render ---------------------------------------------------------

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <h1 className="text-base font-semibold text-white mr-auto">Notebook</h1>

        <span className={clsx(
          'text-[11px] px-2 py-0.5 rounded-full',
          sessionReady
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-amber-500/10 text-amber-400'
        )}>
          {sessionReady ? 'kernel ready' : 'starting…'}
        </span>

        <button onClick={restart} title="Restart kernel (clears all state)"
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5">
          <RotateCw size={14} />
        </button>
        <button onClick={open} title="Open notebook"
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5">
          <FolderOpen size={14} />
        </button>
        <button onClick={save} title="Save notebook"
          className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/5">
          <Save size={14} />
        </button>

        {busy ? (
          <button onClick={interrupt}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 text-rose-400 rounded text-sm hover:bg-rose-500/30">
            <Square size={13} fill="currentColor" /> Stop
          </button>
        ) : (
          <button onClick={runAll} disabled={!sessionReady}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/20 text-brand-300 rounded text-sm hover:bg-brand-500/30 disabled:opacity-40">
            <Play size={13} fill="currentColor" /> Run all
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* cells */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {cells.map((cell, i) => (
            <CellView
              key={cell.id}
              cell={cell}
              selected={selectedId === cell.id}
              isLast={i === cells.length - 1}
              onChange={patchCell}
              onRun={runCell}
              onDelete={deleteCell}
              onMove={moveCell}
              onSelect={setSelectedId}
              onInsertBelow={insertBelow}
            />
          ))}

          <div className="flex items-center gap-2 pt-1 pb-6">
            <button onClick={() => addCell('code')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-white/5 border border-white/5">
              <Plus size={12} /> Code
            </button>
            <button onClick={() => addCell('markdown')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-white/5 border border-white/5">
              <Plus size={12} /> Markdown
            </button>
            <button onClick={() => setCells(starterCells())}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-brand-400 hover:bg-brand-500/10 border border-brand-500/20 ml-auto">
              <Sparkles size={12} /> Reset to agent template
            </button>
          </div>
        </div>

        {/* variable inspector */}
        {showVars && (
          <aside className="w-64 border-l border-white/5 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
              <Cpu size={13} className="text-slate-500" />
              <span className="text-xs font-medium text-slate-300 flex-1">Variables</span>
              <button onClick={refreshVariables} title="Refresh"
                className="p-1 rounded text-slate-500 hover:text-white">
                <RotateCw size={11} />
              </button>
              <button onClick={() => setShowVars(false)} title="Hide"
                className="p-1 rounded text-slate-500 hover:text-white">
                <ChevronRight size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {variables.length === 0 ? (
                <div className="p-3 text-[11px] text-slate-600">
                  Run a cell to create variables.
                </div>
              ) : (
                variables.map((v) => (
                  <div key={v.name} className="px-3 py-1.5 border-b border-white/5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-[11.5px] text-brand-300">{v.name}</span>
                      <span className="text-[10px] text-slate-600">{v.type}</span>
                    </div>
                    <div className="font-mono text-[10.5px] text-slate-500 truncate">
                      {v.repr}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-2 border-t border-white/5">
              <div className="text-[10px] text-slate-600 leading-relaxed">
                In cell scope: <code className="text-slate-500">llm</code>,{' '}
                <code className="text-slate-500">Agent</code>,{' '}
                <code className="text-slate-500">Tool</code>,{' '}
                <code className="text-slate-500">tool</code>,{' '}
                <code className="text-slate-500">display</code>,{' '}
                <code className="text-slate-500">table</code>,{' '}
                <code className="text-slate-500">HTML</code>
              </div>
            </div>
          </aside>
        )}

        {!showVars && (
          <button onClick={() => setShowVars(true)}
            className="w-8 border-l border-white/5 text-slate-600 hover:text-slate-300 text-[10px]">
            VARS
          </button>
        )}
      </div>
    </div>
  )
}
