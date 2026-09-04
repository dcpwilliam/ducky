import React, { useRef, useEffect } from 'react'
import type { TelemetrySample } from '@shared/monitor-types'

interface Props {
  samples: TelemetrySample[]
  dataKey: string
  color: string
  label: string
  max: number
}

function getValue(sample: TelemetrySample, key: string): number {
  const parts = key.split('.')
  let val: unknown = sample
  for (const p of parts) {
    if (val == null) return 0
    val = (val as Record<string, unknown>)[p]
  }
  return (val as number) ?? 0
}

export function TimeSeriesChart({ samples, dataKey, color, label, max }: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || samples.length < 2) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const padding = { top: 4, right: 4, bottom: 16, left: 36 }
    const plotW = w - padding.left - padding.right
    const plotH = h - padding.top - padding.bottom

    ctx.clearRect(0, 0, w, h)

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (plotH / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(w - padding.right, y)
      ctx.stroke()
    }

    // Y-axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '10px Inter'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (plotH / 4) * i
      const val = max - (max / 4) * i
      ctx.fillText(`${val.toFixed(0)}`, padding.left - 4, y + 3)
    }

    // Data line
    const data = samples.map((s) => getValue(s, dataKey))
    const step = plotW / (data.length - 1)

    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'

    for (let i = 0; i < data.length; i++) {
      const x = padding.left + i * step
      const y = padding.top + plotH - (data[i] / max) * plotH
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Fill under curve
    const lastX = padding.left + (data.length - 1) * step
    ctx.lineTo(lastX, padding.top + plotH)
    ctx.lineTo(padding.left, padding.top + plotH)
    ctx.closePath()

    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH)
    gradient.addColorStop(0, color + '30')
    gradient.addColorStop(1, color + '05')
    ctx.fillStyle = gradient
    ctx.fill()

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '10px Inter'
    ctx.textAlign = 'left'
    const current = data[data.length - 1]
    ctx.fillText(`${label}: ${current.toFixed(1)}%`, padding.left + 4, h - 2)
  }, [samples, dataKey, color, label, max])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-32"
      style={{ display: 'block' }}
    />
  )
}
