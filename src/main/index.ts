import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createWindow } from './window'
import { registerAllHandlers, setServices } from './ipc/register-handlers'
import { BackendProcess } from './backend/BackendProcess'
import { MonitorService } from './monitor/MonitorService'
import { PtyManager } from './pty/PtyManager'
import { JupyterManager } from './jupyter/JupyterManager'
import { initUpdater, stopUpdater } from './updater'

// The host environment injects ELECTRON_RUN_AS_NODE=1 into the shell, which
// forces the Electron binary to degenerate into a plain Node process (making
// require('electron').app === undefined and crashing on startup). Strip it so
// the main process can boot as a real Electron app. We also relax the macOS
// sandbox / GPU process, which is blocked by the restricted dev environment —
// MLX inference runs in the separate Python backend process and does not rely
// on Electron's GPU process, so this is safe for local development.
delete process.env.ELECTRON_RUN_AS_NODE
if (!app.isPackaged) {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  // Electron's own GPU process can't initialize under the restricted sandbox;
  // fall back to software rendering for the UI. The 3D sim page still works
  // via SwiftShader, and the Python backend keeps full MLX GPU acceleration.
  app.commandLine.appendSwitch('disable-gpu')
}

let mainWindow: BrowserWindow | null = null
let backend: BackendProcess | null = null
let monitor: MonitorService | null = null
let ptyManager: PtyManager | null = null
let jupyterManager: JupyterManager | null = null

async function onReady(): Promise<void> {
  electronApp.setAppUserModelId('com.ducky.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ptyManager = new PtyManager()
  jupyterManager = new JupyterManager()

  backend = new BackendProcess()

  registerAllHandlers()
  setServices(backend, ptyManager, jupyterManager)

  mainWindow = createWindow()

  await backend.start()

  monitor = new MonitorService(mainWindow)
  monitor.start()

  initUpdater(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(onReady)

app.on('window-all-closed', () => {
  monitor?.stop()
  backend?.stop()
  ptyManager?.killAll()
  jupyterManager?.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow()
  }
})

app.on('before-quit', () => {
  stopUpdater()
  monitor?.stop()
  backend?.stop()
  ptyManager?.killAll()
  jupyterManager?.stop()
})

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
