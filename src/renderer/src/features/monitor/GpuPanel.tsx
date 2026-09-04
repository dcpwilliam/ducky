import React from 'react'
import type { TelemetrySample } from '@shared/monitor-types'
import { Gauge } from '../../components/Gauge'

interface Props {
  latest?: TelemetrySample
}

export function GpuPanel({ latest }: Props): React.ReactElement {
  const gpus = latest?.gpus ?? []

  if (gpus.length === 0) {
    return (
      <div className="bg-surface-1 rounded-xl border border-white/5 p-5">
        <h2 className="text-lg font-semibold text-white mb-2">GPU</h2>
        <div className="text-sm text-gray-500">No GPU detected</div>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-white/5 p-5">
      <h2 className="text-lg font-semibold text-white mb-4">GPU</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {gpus.map((gpu, i) => (
          <div key={i} className="bg-surface-2 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-white">{gpu.model}</div>
                <div className="text-xs text-gray-500">{gpu.vendor} — {gpu.driver}</div>
              </div>
              {gpu.utilization != null && (
                <Gauge value={gpu.utilization} label="GPU" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="text-xs">
                <span className="text-gray-500">VRAM: </span>
                <span className="text-white">
                  {gpu.vramUsed != null
                    ? `${gpu.vramUsed} / ${gpu.vram} MB`
                    : `${gpu.vram} MB`}
                </span>
              </div>
              <div className="text-xs">
                <span className="text-gray-500">Temp: </span>
                <span className="text-white">
                  {gpu.temperature != null ? `${gpu.temperature}°C` : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
