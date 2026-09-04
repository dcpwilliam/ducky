import { ipcMain, app, dialog } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getMainWindow } from '../index'
import { BackendProcess } from '../backend/BackendProcess'
import { PtyManager } from '../pty/PtyManager'
import { JupyterManager } from '../jupyter/JupyterManager'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

let backend: BackendProcess | null = null
let ptyManager: PtyManager | null = null
let jupyterManager: JupyterManager | null = null

export function setServices(b: BackendProcess, p: PtyManager, j: JupyterManager): void {
  backend = b
  ptyManager = p
  jupyterManager = j
}

export function registerAllHandlers(): void {
  // Window controls
  ipcMain.on(IPC.WINDOW_MINIMIZE, () => getMainWindow()?.minimize())
  ipcMain.on(IPC.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.on(IPC.WINDOW_CLOSE, () => getMainWindow()?.close())

  // Backend RPC
  ipcMain.handle(IPC.BACKEND_INVOKE, async (_event, method: string, params?: Record<string, unknown>) => {
    if (!backend) throw new Error('Backend not initialized')
    return backend.invoke(method, params)
  })

  ipcMain.handle(IPC.BACKEND_STATUS, () => {
    return backend?.getStatus() ?? { connected: false, pid: null }
  })

  // PTY
  ipcMain.handle(IPC.PTY_CREATE, async (_event, opts: { cols: number; rows: number; cwd?: string; shell?: string; env?: string[] }) => {
    if (!ptyManager) throw new Error('PTY manager not initialized')
    return ptyManager.create(opts)
  })

  ipcMain.on(IPC.PTY_WRITE, (_event, id: string, data: string) => {
    ptyManager?.write(id, data)
  })

  ipcMain.on(IPC.PTY_RESIZE, (_event, id: string, cols: number, rows: number) => {
    ptyManager?.resize(id, cols, rows)
  })

  ipcMain.on(IPC.PTY_KILL, (_event, id: string) => {
    ptyManager?.kill(id)
  })

  // Jupyter
  ipcMain.handle(IPC.JUPYTER_START, async (_event, envPath: string) => {
    if (!jupyterManager) throw new Error('Jupyter manager not initialized')
    return jupyterManager.start(envPath)
  })

  ipcMain.handle(IPC.JUPYTER_STOP, async () => {
    jupyterManager?.stop()
  })

  ipcMain.handle(IPC.JUPYTER_STATUS, () => {
    return jupyterManager?.getStatus() ?? { running: false, url: null }
  })

  // File system
  ipcMain.handle(IPC.FS_OPEN_DIALOG, async (_event, options: { filters?: Electron.FileFilter[]; properties?: Electron.OpenDialogOptions['properties'] }) => {
    const result = await dialog.showOpenDialog({
      filters: options.filters ?? [{ name: 'All Files', extensions: ['*'] }],
      properties: options.properties ?? ['openFile']
    })
    return result
  })

  ipcMain.handle(IPC.FS_READ_DIR, async (_event, dirPath: string) => {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: join(dirPath, e.name)
    }))
  })

  ipcMain.handle(IPC.FS_READ_FILE, async (_event, filePath: string) => {
    return readFile(filePath, 'utf-8')
  })

  // App info
  ipcMain.handle(IPC.APP_HOME_DIR, () => homedir())
}
