import React, { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal code editor: a transparent textarea layered over a highlighted
 * <pre>. This avoids pulling in CodeMirror for what is essentially "edit a few
 * lines of Python", while still giving indentation, syntax colour and the
 * shortcuts notebook users expect.
 */

interface Props {
  value: string
  onChange: (next: string) => void
  onRun?: () => void
  onRunAndNext?: () => void
  onFocus?: () => void
  placeholder?: string
  minRows?: number
  autoFocus?: boolean
}

const KEYWORDS = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break',
  'continue', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise',
  'with', 'lambda', 'yield', 'assert', 'global', 'nonlocal', 'pass', 'in',
  'is', 'not', 'and', 'or', 'await', 'async', 'del'
])

const BUILTINS = new Set([
  'print', 'len', 'range', 'dict', 'list', 'set', 'tuple', 'str', 'int',
  'float', 'bool', 'sum', 'min', 'max', 'sorted', 'enumerate', 'zip', 'map',
  'filter', 'open', 'type', 'isinstance', 'repr', 'abs', 'round', 'any', 'all'
])

/** Tokenise into (className, text) pairs for the highlight layer. */
function highlight(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const pattern = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(\d+\.?\d*)\b|([A-Za-z_][A-Za-z0-9_]*)|([^\sA-Za-z0-9_]+)/g

  let last = 0
  let key = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(code)) !== null) {
    if (match.index > last) {
      out.push(code.slice(last, match.index))
    }
    const [full, comment, str, num, ident] = match

    if (comment) {
      out.push(<span key={key++} className="text-slate-500 italic">{full}</span>)
    } else if (str) {
      out.push(<span key={key++} className="text-emerald-400">{full}</span>)
    } else if (num) {
      out.push(<span key={key++} className="text-orange-400">{full}</span>)
    } else if (ident) {
      if (KEYWORDS.has(ident)) {
        out.push(<span key={key++} className="text-violet-400">{full}</span>)
      } else if (BUILTINS.has(ident)) {
        out.push(<span key={key++} className="text-sky-400">{full}</span>)
      } else {
        out.push(full)
      }
    } else {
      out.push(<span key={key++} className="text-slate-400">{full}</span>)
    }
    last = match.index + full.length
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}

export function CodeEditor({
  value,
  onChange,
  onRun,
  onRunAndNext,
  onFocus,
  placeholder,
  minRows = 2,
  autoFocus
}: Props): React.ReactElement {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const [focused, setFocused] = useState(false)

  // Grow the editor to fit content so cells never scroll internally.
  const resize = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, minRows * 21 + 16)}px`
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop
      preRef.current.scrollLeft = ta.scrollLeft
    }
  }, [minRows])

  useEffect(resize, [value, resize])

  useEffect(() => {
    if (autoFocus) taRef.current?.focus()
  }, [autoFocus])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const ta = e.currentTarget

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onRun?.()
      return
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      onRunAndNext?.()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const { selectionStart: s, selectionEnd: en } = ta
      const next = `${value.slice(0, s)}    ${value.slice(en)}`
      onChange(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 4
      })
      return
    }
    // Cmd+/ toggles a comment on the current line(s).
    if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      const { selectionStart: s, selectionEnd: en } = ta
      const startOfLine = value.lastIndexOf('\n', s - 1) + 1
      const endOfLine = value.indexOf('\n', en)
      const end = endOfLine === -1 ? value.length : endOfLine
      const block = value.slice(startOfLine, end)
      const lines = block.split('\n')
      const allCommented = lines.every((l) => l.trimStart().startsWith('#'))
      const updated = lines
        .map((l) => (allCommented ? l.replace(/^(\s*)#\s?/, '$1') : `# ${l}`))
        .join('\n')
      onChange(value.slice(0, startOfLine) + updated + value.slice(end))
    }
  }

  return (
    <div className="relative font-mono text-[13px] leading-[21px]">
      <pre
        ref={preRef}
        aria-hidden
        className="absolute inset-0 m-0 px-3 py-2 overflow-hidden whitespace-pre-wrap break-words pointer-events-none text-slate-200"
      >
        {highlight(value)}
        {value.endsWith('\n') ? '\n' : ''}
      </pre>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={() => {
          if (preRef.current && taRef.current) {
            preRef.current.scrollTop = taRef.current.scrollTop
            preRef.current.scrollLeft = taRef.current.scrollLeft
          }
        }}
        onFocus={() => {
          setFocused(true)
          onFocus?.()
        }}
        onBlur={() => setFocused(false)}
        spellCheck={false}
        placeholder={placeholder}
        className={[
          'relative w-full resize-none bg-transparent px-3 py-2',
          'text-transparent caret-slate-100 outline-none overflow-hidden',
          'whitespace-pre-wrap break-words',
          focused ? 'ring-1 ring-brand-500/40 rounded' : ''
        ].join(' ')}
        style={{ minHeight: minRows * 21 + 16 }}
      />
      {!value && placeholder && (
        <div className="absolute inset-0 px-3 py-2 pointer-events-none text-slate-600">
          {placeholder}
        </div>
      )}
    </div>
  )
}
