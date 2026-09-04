import React, { useEffect, useState } from 'react'
import { Circle } from 'lucide-react'

export function StatusBar(): React.ReactElement {
  const [backendStatus, setBackendStatus] = useState<{ connected: boolean; pid: number | null }>({
    connected: false,
    pid: null
  })

  useEffect(() => {
    const check = async (): Promise<void> => {
      try {
        const status = await window.ducky.getBackendStatus()
        setBackendStatus(status)
      } catch {
        setBackendStatus({ connected: false, pid: null })
      }
    }

    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-6 bg-surface-1 border-t border-white/5 flex items-center px-3 gap-4">
      <div className="flex items-center gap-1.5">
        <Circle
          size={8}
          className={backendStatus.connected ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}
        />
        <span className="text-xs text-gray-500">
          Backend {backendStatus.connected ? 'connected' : 'disconnected'}
        </span>
      </div>
      {backendStatus.pid && (
        <span className="text-xs text-gray-600">PID: {backendStatus.pid}</span>
      )}
    </div>
  )
}
