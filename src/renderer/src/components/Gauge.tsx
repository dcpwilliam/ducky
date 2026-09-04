import React from 'react'

interface Props {
  value: number
  label: string
  size?: number
  color?: string
}

export function Gauge({ value, label, size = 64, color = '#f59e0b' }: Props): React.ReactElement {
  const strokeWidth = 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(value, 100) / 100) * circumference

  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="gauge-ring"
        />
      </svg>
      <div className="flex flex-col">
        <span className="text-sm font-bold text-white">{value.toFixed(1)}%</span>
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
    </div>
  )
}
