import React from 'react'
import type { TelemetrySample } from '@shared/monitor-types'
import { Gauge } from '../../components/Gauge'
import { TimeSeriesChart } from './TimeSeriesChart'

interface Props {
  samples: TelemetrySample[]
  latest?: TelemetrySample
}

export function CpuPanel({ samples, latest }: Props): React.ReactElement {
  const load = latest?.cpu.totalLoad ?? 0
  const coreLoads = latest?.cpu.coreLoads ?? []
  const temp = latest?.cpuTemp

  return (
    <div className="bg-surface-1 rounded-xl border border-white/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">CPU</h2>
        <Gauge value={load} label="Usage" />
      </div>

      {temp?.available && temp.main != null && (
        <div className="text-sm text-gray-400 mb-3">
          Temperature: <span className="text-white font-medium">{temp.main.toFixed(0)}°C</span>
        </div>
      )}

      {coreLoads.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">Per-Core Usage</div>
          <div className="grid grid-cols-8 gap-1">
            {coreLoads.map((load, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-full h-16 bg-surface-2 rounded overflow-hidden flex flex-col justify-end">
                  <div
                    className="w-full bg-brand-500/60 rounded-t transition-all duration-300"
                    style={{ height: `${load}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-600 mt-0.5">{i}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <TimeSeriesChart
        samples={samples}
        dataKey="cpu.totalLoad"
        color="#f59e0b"
        label="CPU %"
        max={100}
      />
    </div>
  )
}
