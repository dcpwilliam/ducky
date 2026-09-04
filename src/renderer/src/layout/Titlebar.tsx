import React from 'react'
import { Minus, Square, X } from 'lucide-react'

export function Titlebar(): React.ReactElement {
  return (
    <div className="titlebar-drag flex items-center h-9 bg-surface-1 border-b border-white/5 px-3">
      <div className="flex items-center gap-2 flex-1">
        <div className="w-5 h-5 rounded bg-brand-500 flex items-center justify-center">
          <span className="text-xs font-bold text-white">D</span>
        </div>
        <span className="text-sm font-medium text-gray-300">Ducky</span>
      </div>
      <div className="titlebar-no-drag flex items-center gap-1">
        <button
          onClick={() => window.ducky.minimize()}
          className="p-1.5 rounded hover:bg-white/10 transition-colors"
        >
          <Minus size={14} className="text-gray-400" />
        </button>
        <button
          onClick={() => window.ducky.maximize()}
          className="p-1.5 rounded hover:bg-white/10 transition-colors"
        >
          <Square size={12} className="text-gray-400" />
        </button>
        <button
          onClick={() => window.ducky.close()}
          className="p-1.5 rounded hover:bg-red-500/80 transition-colors"
        >
          <X size={14} className="text-gray-400" />
        </button>
      </div>
    </div>
  )
}
