import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createWindow } from './window'
import { registerAllHandlers } from './ipc/register-handlers'
import { BackendProcess } from './backend/BackendProcess'
import { MonitorService } from './monitor/MonitorService'
import { initUpdater, stopUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
let backend: BackendProcess | null = null
let monitor: MonitorService | null = null

async function onReady(): Promise<void> {
  electronApp.setAppUserModelId('com.ducky.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAllHandlers()

  mainWindow = createWindow()

  backend = new BackendProcess()
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
})

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
