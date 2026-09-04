import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

if (!window.ducky) {
  const noop = (): (() => void) => () => {}
  const noopAsync = async (): Promise<unknown> => ({})
  window.ducky = {
    invokeRpc: noopAsync,
    getBackendStatus: async () => ({ connected: false, pid: null, restartCount: 0 }),
    onBackendNotification: noop,
    onTelemetry: noop,
    createPty: async () => 'mock-pty',
    writePty: (): void => {},
    resizePty: (): void => {},
    killPty: (): void => {},
    onPtyData: noop,
    startJupyter: async () => ({ url: '', token: '', port: 0 }),
    stopJupyter: noopAsync,
    getJupyterStatus: async () => ({ running: false, url: null }),
    onJupyterStatus: noop,
    openDialog: async () => ({ canceled: true, filePaths: [] }),
    readDir: async () => [],
    readFile: async () => '',
    startTraining: noopAsync,
    cancelTraining: noopAsync,
    getTrainingStatus: async () => ({ running: false }),
    onTrainingProgress: noop,
    onTrainingDone: noop,
    downloadUpdate: noopAsync,
    installUpdate: noopAsync,
    onUpdaterEvent: noop,
    minimize: (): void => {},
    maximize: (): void => {},
    close: (): void => {},
    getHomeDir: async () => ''
  } as any
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
