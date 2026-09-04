import React, { useEffect, useRef, useState } from 'react'
import { Play, Square, FolderOpen, RefreshCw } from 'lucide-react'

export function NotebookPage(): React.ReactElement {
  const [jupyterUrl, setJupyterUrl] = useState<string | null>(null)
  const [jupyterRunning, setJupyterRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const webviewRef = useRef<Electron.WebviewTag>(null)

  useEffect(() => {
    const unsub = window.ducky.onJupyterStatus((status) => {
      setJupyterRunning(status.running)
      setJupyterUrl(status.url)
    })

    window.ducky.getJupyterStatus().then((status: any) => {
      if (status?.running) {
        setJupyterRunning(true)
        setJupyterUrl(status.url)
      }
    })

    return () => { unsub() }
  }, [])

  const handleStart = async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.ducky.startJupyter('default') as { url: string }
      setJupyterUrl(result.url)
      setJupyterRunning(true)
    } catch (err) {
      alert(`Failed to start Jupyter: ${err}`)
    }
    setLoading(false)
  }

  const handleStop = async (): Promise<void> => {
    await window.ducky.stopJupyter()
    setJupyterUrl(null)
    setJupyterRunning(false)
  }

  const handleOpenFile = async (): Promise<void> => {
    const result = await window.ducky.openDialog({
      filters: [{ name: 'Notebooks', extensions: ['ipynb'] }],
      properties: ['openFile']
    })
    if (!result.canceled && result.filePaths[0] && jupyterUrl) {
      const filePath = result.filePaths[0]
      const home = await window.ducky.getHomeDir() as string
      const treePath = filePath.replace(home, '')
      const newUrl = jupyterUrl.split('/lab')[0] + `/lab/tree${treePath}`
      setJupyterUrl(newUrl)
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="p-4 border-b border-white/5 flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white flex-1">Jupyter Notebook</h1>

        <button
          onClick={handleOpenFile}
          disabled={!jupyterRunning}
          className="px-3 py-1.5 bg-surface-3 rounded text-sm text-gray-300 hover:bg-surface-4 disabled:opacity-40"
        >
          <FolderOpen size={14} className="inline mr-1.5" />
          Open Notebook
        </button>

        {jupyterRunning ? (
          <button
            onClick={handleStop}
            className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30"
          >
            <Square size={14} className="inline mr-1.5" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={loading}
            className="px-3 py-1.5 bg-brand-500/20 text-brand-400 rounded text-sm hover:bg-brand-500/30"
          >
            <Play size={14} className="inline mr-1.5" />
            {loading ? 'Starting...' : 'Start Jupyter'}
          </button>
        )}
      </div>

      <div className="flex-1 relative">
        {jupyterUrl ? (
          <webview
            ref={webviewRef as any}
            src={jupyterUrl}
            className="w-full h-full"
            style={{ border: 'none' }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-3 opacity-20">📓</div>
              <div className="text-gray-500 text-sm">Start Jupyter to begin</div>
              <div className="text-gray-600 text-xs mt-1">
                Jupyter Lab will open inside this panel
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
