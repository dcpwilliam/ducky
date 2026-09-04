import React, { useEffect, useRef, useState } from 'react'
import type { TelemetrySample } from '@shared/monitor-types'
import { CpuPanel } from './CpuPanel'
import { MemoryPanel } from './MemoryPanel'
import { GpuPanel } from './GpuPanel'

export function MonitorPage(): React.ReactElement {
  const [samples, setSamples] = useState<TelemetrySample[]>([])

  useEffect(() => {
    const unsub = window.ducky.onTelemetry((sample) => {
      setSamples((prev) => {
        const next = [...prev, sample as TelemetrySample]
        return next.length > 300 ? next.slice(-300) : next
      })
    })
    return () => { unsub() }
  }, [])

  const latest = samples[samples.length - 1]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">System Monitor</h1>
        <p className="text-sm text-gray-500 mt-1">Real-time hardware telemetry</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CpuPanel samples={samples} latest={latest} />
        <MemoryPanel samples={samples} latest={latest} />
      </div>

      <GpuPanel latest={latest} />
    </div>
  )
}
