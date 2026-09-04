import React, { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Terminal as TerminalIcon, RefreshCw, Package, Search } from 'lucide-react'

interface CondaEnv {
  name: string
  path: string
  isDefault?: boolean
}

export function EnvPage(): React.ReactElement {
  const [envs, setEnvs] = useState<CondaEnv[]>([])
  const [selectedEnv, setSelectedEnv] = useState<string | null>(null)
  const [packages, setPackages] = useState<{ name: string; version: string }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'packages' | 'terminal'>('packages')

  useEffect(() => {
    loadEnvs()
  }, [])

  const loadEnvs = async (): Promise<void> => {
    try {
      const result = await window.ducky.invokeRpc('conda.listEnvs') as { envs: CondaEnv[] }
      setEnvs(result?.envs ?? [])
    } catch {
      setEnvs([])
    }
  }

  const loadPackages = async (envPath: string): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.ducky.invokeRpc('env.listPackages', { envPath }) as { packages: { name: string; version: string }[] }
      setPackages(result?.packages ?? [])
    } catch {
      setPackages([])
    }
    setLoading(false)
  }

  const handleSelectEnv = (env: CondaEnv): void => {
    setSelectedEnv(env.path)
    loadPackages(env.path)
  }

  const handleCreateEnv = async (): Promise<void> => {
    const name = prompt('Environment name:')
    if (!name) return
    try {
      await window.ducky.invokeRpc('conda.create', { name, python: '3.11' })
      await loadEnvs()
    } catch (err) {
      alert(`Failed to create env: ${err}`)
    }
  }

  const handleRemoveEnv = async (envPath: string): Promise<void> => {
    if (!confirm('Remove this environment?')) return
    try {
      await window.ducky.invokeRpc('conda.remove', { path: envPath })
      await loadEnvs()
      if (selectedEnv === envPath) {
        setSelectedEnv(null)
        setPackages([])
      }
    } catch (err) {
      alert(`Failed to remove env: ${err}`)
    }
  }

  const handleInstallPackage = async (): Promise<void> => {
    const pkg = prompt('Package name:')
    if (!pkg || !selectedEnv) return
    try {
      await window.ducky.invokeRpc('env.installPackages', { envPath: selectedEnv, packages: [pkg] })
      await loadPackages(selectedEnv)
    } catch (err) {
      alert(`Failed to install: ${err}`)
    }
  }

  const filteredPackages = packages.filter(
    (p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-full gap-4 -m-6">
      {/* Env list sidebar */}
      <div className="w-64 bg-surface-1 border-r border-white/5 flex flex-col">
        <div className="p-3 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Environments</h2>
          <div className="flex gap-1">
            <button onClick={handleCreateEnv} className="p-1 rounded hover:bg-white/10" title="Create env">
              <Plus size={14} className="text-gray-400" />
            </button>
            <button onClick={loadEnvs} className="p-1 rounded hover:bg-white/10" title="Refresh">
              <RefreshCw size={14} className="text-gray-400" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {envs.map((env) => (
            <div
              key={env.path}
              onClick={() => handleSelectEnv(env)}
              className={`px-3 py-2 cursor-pointer flex items-center justify-between group ${
                selectedEnv === env.path ? 'bg-brand-500/10 text-brand-400' : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              <div>
                <div className="text-sm font-medium">{env.name}</div>
                <div className="text-[10px] text-gray-600 truncate max-w-[180px]">{env.path}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveEnv(env.path) }}
                className="p-1 rounded hover:bg-red-500/20 opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={12} className="text-red-400" />
              </button>
            </div>
          ))}
          {envs.length === 0 && (
            <div className="p-4 text-sm text-gray-600">No environments found</div>
          )}
        </div>
      </div>

      {/* Detail area */}
      <div className="flex-1 flex flex-col">
        {selectedEnv ? (
          <>
            <div className="p-3 border-b border-white/5 flex items-center gap-2">
              <button
                onClick={() => setActiveTab('packages')}
                className={`px-3 py-1.5 rounded text-sm ${activeTab === 'packages' ? 'bg-brand-500/20 text-brand-400' : 'text-gray-400 hover:text-white'}`}
              >
                <Package size={14} className="inline mr-1.5" />
                Packages
              </button>
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1.5 rounded text-sm ${activeTab === 'terminal' ? 'bg-brand-500/20 text-brand-400' : 'text-gray-400 hover:text-white'}`}
              >
                <TerminalIcon size={14} className="inline mr-1.5" />
                Terminal
              </button>
            </div>

            {activeTab === 'packages' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 flex gap-2 border-b border-white/5">
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Filter packages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-surface-2 rounded pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <button
                    onClick={handleInstallPackage}
                    className="px-3 py-1.5 bg-brand-500/20 text-brand-400 rounded text-sm hover:bg-brand-500/30"
                  >
                    Install
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  {loading ? (
                    <div className="p-4 text-sm text-gray-500">Loading...</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-surface-1">
                        <tr className="text-gray-500 text-left">
                          <th className="px-3 py-2 font-medium">Package</th>
                          <th className="px-3 py-2 font-medium">Version</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPackages.map((pkg) => (
                          <tr key={pkg.name} className="border-t border-white/5 hover:bg-white/5">
                            <td className="px-3 py-1.5 text-white">{pkg.name}</td>
                            <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{pkg.version}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'terminal' && (
              <TerminalPanel envPath={selectedEnv} />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
            Select an environment to view details
          </div>
        )}
      </div>
    </div>
  )
}

function TerminalPanel({ envPath }: { envPath: string }): React.ReactElement {
  const termRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let term: any = null
    let ptyId: string | null = null
    let unsub: (() => void) | null = null
    let handleResize: (() => void) | null = null
    let disposed = false

    const init = async (): Promise<void> => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      await import('@xterm/xterm/css/xterm.css')

      if (!termRef.current || disposed) return

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'JetBrains Mono, monospace',
        theme: {
          background: '#12121a',
          foreground: '#e5e5e5',
          cursor: '#f59e0b'
        }
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termRef.current)
      fitAddon.fit()

      ptyId = await window.ducky.createPty({
        cols: term.cols,
        rows: term.rows
      })

      if (disposed) {
        term.dispose()
        if (ptyId) window.ducky.killPty(ptyId)
        return
      }

      term.onData((data: string) => {
        if (ptyId) window.ducky.writePty(ptyId, data)
      })

      unsub = window.ducky.onPtyData((id: string, data: string) => {
        if (id === ptyId) term.write(data)
      })

      handleResize = (): void => {
        fitAddon.fit()
        if (ptyId) window.ducky.resizePty(ptyId, term.cols, term.rows)
      }
      window.addEventListener('resize', handleResize)
    }

    init()

    return () => {
      disposed = true
      unsub?.()
      if (handleResize) window.removeEventListener('resize', handleResize)
      if (ptyId) window.ducky.killPty(ptyId)
      term?.dispose()
    }
  }, [envPath])

  return <div ref={termRef} className="flex-1 p-2 bg-surface-2" />
}
