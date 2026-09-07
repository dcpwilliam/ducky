import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Monitor, Terminal, BookOpen, Gamepad2, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { path: '/', label: 'Models', icon: Sparkles },
  { path: '/notebook', label: 'Notebook', icon: BookOpen },
  { path: '/monitor', label: 'Monitor', icon: Monitor },
  { path: '/env', label: 'Python Env', icon: Terminal },
  { path: '/sim', label: 'Simulation', icon: Gamepad2 }
]

export function Sidebar(): React.ReactElement {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="w-56 bg-surface-1 border-r border-white/5 flex flex-col">
      <div className="flex-1 py-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-500/10 text-brand-400 border-r-2 border-brand-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              )}
            >
              <Icon size={18} />
              {item.label}
            </button>
          )
        })}
      </div>
      <div className="p-4 border-t border-white/5">
        <div className="text-xs text-gray-500">v0.1.0</div>
      </div>
    </nav>
  )
}
