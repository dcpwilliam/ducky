import React, { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { MonitorPage } from './features/monitor/MonitorPage'
import { EnvPage } from './features/pyenv/EnvPage'
import { NotebookPage } from './features/notebook/NotebookPage'
import { SimPage } from './features/sim/SimPage'
import { ModelsPage } from './features/models/ModelsPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Onboarding, isOnboardingDone } from './components/Onboarding'

export default function App(): React.ReactElement {
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone())

  return (
    <ErrorBoundary>
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
      <AppLayout>
        <Routes>
          <Route path="/" element={<ModelsPage />} />
          <Route path="/notebook" element={<NotebookPage />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/env" element={<EnvPage />} />
          <Route path="/sim" element={<SimPage />} />
        </Routes>
      </AppLayout>
    </ErrorBoundary>
  )
}
