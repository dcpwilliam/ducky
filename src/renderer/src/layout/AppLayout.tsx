import React from 'react'
import { Sidebar } from './Sidebar'
import { Titlebar } from './Titlebar'
import { StatusBar } from './StatusBar'

export function AppLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col h-screen bg-surface-0">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
