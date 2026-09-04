import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc-channels'

let checkInterval: NodeJS.Timeout | null = null

export function initUpdater(mainWindow: BrowserWindow): void {
  if (is.dev) return

  autoUpdater.logger = console
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version)
    mainWindow.webContents.send(IPC.UPDATER_EVENT, { type: 'update-available', info })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('No update available')
    mainWindow.webContents.send(IPC.UPDATER_EVENT, { type: 'update-not-available' })
  })

  autoUpdater.on('error', (err) => {
    console.error('Updater error:', err)
    mainWindow.webContents.send(IPC.UPDATER_EVENT, { type: 'error', message: err.message })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send(IPC.UPDATER_EVENT, {
      type: 'download-progress',
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred
      }
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version)
    mainWindow.webContents.send(IPC.UPDATER_EVENT, { type: 'update-downloaded', info })
  })

  ipcMain.handle(IPC.UPDATER_DOWNLOAD, async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle(IPC.UPDATER_INSTALL, () => {
    autoUpdater.quitAndInstall()
  })

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Failed to check for updates:', err)
  })

  checkInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 4 * 60 * 60 * 1000)
}

export function stopUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}
