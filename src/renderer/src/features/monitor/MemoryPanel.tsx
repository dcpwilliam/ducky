import React from 'react'
import type { TelemetrySample } from '@shared/monitor-types'
import { Gauge } from '../../components/Gauge'
import { TimeSeriesChart } from './TimeSeriesChart'

interface Props {
  samples: TelemetrySample[]
  latest?: TelemetrySample
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function MemoryPanel({ samples, latest }: Props): React.ReactElement {
  const mem = latest?.memory
  const percent = mem?.percent ?? 0

  return (
    <div className="bg-surface-1 rounded-xl border border-white/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Memory</h2>
        <Gauge value={percent} label="Usage" />
      </div>

      {mem && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-gray-500">Used</div>
            <div className="text-sm font-medium text-white">{formatBytes(mem.used)}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-gray-500">Total</div>
            <div className="text-sm font-medium text-white">{formatBytes(mem.total)}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-gray-500">Free</div>
            <div className="text-sm font-medium text-white">{formatBytes(mem.free)}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-gray-500">Swap</div>
            <div className="text-sm font-medium text-white">{formatBytes(mem.swapUsed)} / {formatBytes(mem.swapTotal)}</div>
          </div>
        </div>
      )}

      <TimeSeriesChart
        samples={samples}
        dataKey="memory.percent"
        color="#3b82f6"
        label="Memory %"
        max={100}
      />
    </div>
  )
}
