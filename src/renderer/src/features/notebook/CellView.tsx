import React, { useState } from 'react'
import {
  Play, Square, Trash2, ChevronUp, ChevronDown, Code2, Type, Eye
} from 'lucide-react'
import { clsx } from 'clsx'
import type { Cell } from '@shared/rpc-types'
import { CodeEditor } from './CodeEditor'
import { OutputView } from './OutputView'

interface Props {
  cell: Cell
  selected: boolean
  isLast: boolean
  onChange: (id: string, patch: Partial<Cell>) => void
  onRun: (id: string, advance: boolean) => void
  onDelete: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onSelect: (id: string) => void
  onInsertBelow: (id: string, type: 'code' | 'markdown') => void
}

export function CellView({
  cell, selected, isLast, onChange, onRun, onDelete, onMove, onSelect,
  onInsertBelow
}: Props): React.ReactElement {
  const [editingMd, setEditingMd] = useState(false)
  const isCode = cell.type === 'code'
  const running = cell.status === 'running'

  return (
    <div
      onClick={() => onSelect(cell.id)}
      className={clsx(
        'group relative rounded-lg border transition-colors',
        selected
          ? 'border-brand-500/50 bg-surface-2/60'
          : 'border-white/5 bg-surface-1/40 hover:border-white/10'
      )}
    >
      {/* gutter */}
      <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col items-center pt-2 gap-1">
        {isCode ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onRun(cell.id, false) }}
              title="Run cell (⌘↵)"
              disabled={running}
              className={clsx(
                'w-7 h-7 rounded flex items-center justify-center transition-colors',
                running
                  ? 'text-rose-400 hover:bg-rose-500/20'
                  : 'text-slate-500 hover:text-brand-400 hover:bg-brand-500/10'
              )}
            >
              {running ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            </button>
            <span className="text-[10px] font-mono text-slate-600 select-none">
              {cell.executionCount != null ? `[${cell.executionCount}]` : '[ ]'}
            </span>
            {cell.elapsedMs != null && (
              <span className="text-[9px] font-mono text-slate-700 select-none">
                {cell.elapsedMs < 1000
                  ? `${cell.elapsedMs}ms`
                  : `${(cell.elapsedMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setEditingMd(!editingMd) }}
            title={editingMd ? 'Render' : 'Edit'}
            className="w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:text-brand-400 hover:bg-brand-500/10"
          >
            {editingMd ? <Eye size={13} /> : <Type size={13} />}
          </button>
        )}
      </div>

      {/* toolbar */}
      <div className="absolute right-2 top-1.5 hidden group-hover:flex items-center gap-0.5 bg-surface-3/90 rounded-md p-0.5 backdrop-blur">
        <button
          onClick={(e) => { e.stopPropagation(); onInsertBelow(cell.id, 'code') }}
          title="Insert code cell below"
          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
        >
          <Code2 size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onInsertBelow(cell.id, 'markdown') }}
          title="Insert markdown cell below"
          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
        >
          <Type size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove(cell.id, -1) }}
          title="Move up"
          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove(cell.id, 1) }}
          title="Move down"
          disabled={isLast}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronDown size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(cell.id) }}
          title="Delete cell"
          className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/20"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="pl-12 pr-3">
        {isCode ? (
          <>
            <CodeEditor
              value={cell.source}
              onChange={(next) => onChange(cell.id, { source: next })}
              onRun={() => onRun(cell.id, false)}
              onRunAndNext={() => onRun(cell.id, true)}
              onFocus={() => onSelect(cell.id)}
              placeholder="# llm, Agent, Tool, tool, display, table, HTML are available"
            />
            <OutputView
              outputs={cell.outputs}
              error={cell.error}
              streaming={running}
            />
          </>
        ) : editingMd ? (
          <CodeEditor
            value={cell.source}
            onChange={(next) => onChange(cell.id, { source: next })}
            onFocus={() => onSelect(cell.id)}
            placeholder="Markdown…"
          />
        ) : (
          <div
            className="py-2 prose prose-invert prose-sm max-w-none text-slate-300"
            onDoubleClick={() => setEditingMd(true)}
          >
            {cell.source ? (
              <Markdownish text={cell.source} />
            ) : (
              <span className="text-slate-600 italic">Double-click to edit</span>
            )}
          </div>
        )}
      </div>

      {cell.status === 'error' && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-rose-500 rounded-l-lg" />
      )}
      {cell.status === 'ok' && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500/40 rounded-l-lg" />
      )}
    </div>
  )
}

/**
 * Deliberately tiny markdown renderer.
 *
 * Notebook markdown is scratch documentation, so a full parser is overkill.
 * Handles the subset people actually type: headings, bold/italic, code spans,
 * fenced blocks, bullet lists and links.
 */
function Markdownish({ text }: { text: string }): React.ReactElement {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let list: string[] = []
  let fence: string[] | null = null

  const flushList = (): void => {
    if (!list.length) return
    out.push(
      <ul key={`ul-${out.length}`} className="list-disc list-inside my-1 space-y-0.5">
        {list.map((item, i) => <li key={i}>{inline(item.replace(/^[-*]\s+/, ''))}</li>)}
      </ul>
    )
    list = []
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (fence === null) {
        flushList()
        fence = []
      } else {
        out.push(
          <pre key={`pre-${out.length}`}
               className="bg-black/40 rounded p-2 my-1 overflow-x-auto font-mono text-[12px] text-slate-300">
            {fence.join('\n')}
          </pre>
        )
        fence = null
      }
      continue
    }
    if (fence !== null) {
      fence.push(line)
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushList()
      const level = heading[1].length
      const cls = ['text-lg font-semibold', 'text-base font-semibold',
                   'text-sm font-semibold'][Math.min(level - 1, 2)]
      out.push(<div key={`h-${out.length}`} className={`${cls} mt-2 mb-1 text-slate-100`}>
        {inline(heading[2])}
      </div>)
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line)
      continue
    }
    flushList()

    if (!line.trim()) {
      out.push(<div key={`br-${out.length}`} className="h-2" />)
      continue
    }
    out.push(<div key={`p-${out.length}`} className="my-0.5">{inline(line)}</div>)
  }
  flushList()
  if (fence !== null) {
    out.push(
      <pre key={`pre-${out.length}`}
           className="bg-black/40 rounded p-2 my-1 overflow-x-auto font-mono text-[12px] text-slate-300">
        {fence.join('\n')}
      </pre>
    )
  }

  return <>{out}</>
}

/** Bold, italic, inline code and links. */
function inline(text: string): React.ReactNode {
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  const out: React.ReactNode[] = []
  let last = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const [full, code, bold, ital, link] = match
    if (code) {
      out.push(
        <code key={key++} className="bg-black/40 px-1 py-0.5 rounded font-mono text-[12px] text-brand-300">
          {code.slice(1, -1)}
        </code>
      )
    } else if (bold) {
      out.push(<strong key={key++} className="text-slate-100">{bold.slice(2, -2)}</strong>)
    } else if (ital) {
      out.push(<em key={key++}>{ital.slice(1, -1)}</em>)
    } else if (link) {
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(link)
      out.push(
        <a key={key++} href={m?.[2] ?? '#'} className="text-brand-400 underline"
           target="_blank" rel="noreferrer">
          {m?.[1] ?? link}
        </a>
      )
    }
    last = match.index + full.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
