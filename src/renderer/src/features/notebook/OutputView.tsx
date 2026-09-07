import React from 'react'
import type { CellOutput, CellError } from '@shared/rpc-types'

interface Props {
  outputs: CellOutput[]
  error: CellError | null
  streaming?: boolean
}

/** Render one output record. Rich MIME types are handled explicitly. */
function Output({ output }: { output: CellOutput }): React.ReactElement {
  switch (output.type) {
    case 'stdout':
      return (
        <pre className="whitespace-pre-wrap break-words text-slate-300 font-mono text-[12.5px] leading-[18px]">
          {output.text}
        </pre>
      )

    case 'stderr':
      return (
        <pre className="whitespace-pre-wrap break-words text-rose-400/90 font-mono text-[12.5px] leading-[18px]">
          {output.text}
        </pre>
      )

    case 'text':
      return (
        <pre className="whitespace-pre-wrap break-words text-slate-200 font-mono text-[12.5px] leading-[18px]">
          {output.text}
        </pre>
      )

    case 'json':
      return (
        <pre className="whitespace-pre-wrap break-words text-slate-300 font-mono text-[12.5px] leading-[18px]">
          {JSON.stringify(output.data, null, 2)}
        </pre>
      )

    case 'rich':
      return <RichOutput mime={output.mime ?? 'text/html'} data={output.data} />

    default:
      return <pre className="text-slate-400">{JSON.stringify(output)}</pre>
  }
}

function RichOutput({ mime, data }: { mime: string; data: unknown }): React.ReactElement {
  if (mime === 'text/html' && typeof data === 'string') {
    // Content is produced by the user's own kernel, in-process and offline;
    // it is as trusted as the code they typed.
    return <div className="notebook-html" dangerouslySetInnerHTML={{ __html: data }} />
  }
  if (mime === 'text/markdown' && typeof data === 'string') {
    return (
      <div className="text-slate-200 text-[13px] leading-relaxed whitespace-pre-wrap">
        {data}
      </div>
    )
  }
  if (mime === 'image/svg+xml' && typeof data === 'string') {
    return <div className="notebook-html" dangerouslySetInnerHTML={{ __html: data }} />
  }
  if (mime === 'image/png' && typeof data === 'string') {
    return <img src={`data:image/png;base64,${data}`} alt="output" className="max-w-full" />
  }
  if (mime === 'application/json') {
    return (
      <pre className="whitespace-pre-wrap break-words text-slate-300 font-mono text-[12.5px]">
        {JSON.stringify(data, null, 2)}
      </pre>
    )
  }
  return (
    <pre className="whitespace-pre-wrap break-words text-slate-300 font-mono text-[12.5px]">
      {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
    </pre>
  )
}

export function OutputView({ outputs, error, streaming }: Props): React.ReactElement | null {
  const hasContent = outputs.length > 0 || error || streaming
  if (!hasContent) return null

  return (
    <div className="border-t border-white/5 bg-black/20">
      {outputs.map((output, i) => (
        <div key={i} className="px-3 py-2">
          <Output output={output} />
        </div>
      ))}

      {streaming && (
        <div className="px-3 py-2">
          <span className="inline-block w-1.5 h-3.5 bg-brand-400 animate-pulse align-middle" />
        </div>
      )}

      {error && (
        <div className="px-3 py-2 border-t border-rose-500/20 bg-rose-500/5">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[17px] text-rose-300">
            {error.traceback?.length
              ? error.traceback.join('')
              : `${error.ename}: ${error.evalue}`}
          </pre>
        </div>
      )}
    </div>
  )
}
