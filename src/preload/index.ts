import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

const duckyApi = {
  // Backend RPC
  invokeRpc: (method: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.BACKEND_INVOKE, method, params),

  getBackendStatus: () =>
    ipcRenderer.invoke(IPC.BACKEND_STATUS),

  onBackendNotification: (callback: (data: { topic: string; payload: unknown }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { topic: string; payload: unknown }): void => callback(data)
    ipcRenderer.on(IPC.BACKEND_NOTIFICATION, handler)
    return () => ipcRenderer.removeListener(IPC.BACKEND_NOTIFICATION, handler)
  },

  // Monitor
  onTelemetry: (callback: (sample: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sample: unknown): void => callback(sample)
    ipcRenderer.on(IPC.MONITOR_TELEMETRY, handler)
    return () => ipcRenderer.removeListener(IPC.MONITOR_TELEMETRY, handler)
  },

  // PTY
  createPty: (opts: { cols: number; rows: number; cwd?: string; shell?: string; env?: string[] }) =>
    ipcRenderer.invoke(IPC.PTY_CREATE, opts),

  writePty: (id: string, data: string) =>
    ipcRenderer.send(IPC.PTY_WRITE, id, data),

  resizePty: (id: string, cols: number, rows: number) =>
    ipcRenderer.send(IPC.PTY_RESIZE, id, cols, rows),

  killPty: (id: string) =>
    ipcRenderer.send(IPC.PTY_KILL, id),

  onPtyData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string): void => callback(id, data)
    ipcRenderer.on(IPC.PTY_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_DATA, handler)
  },

  // Jupyter
  startJupyter: (envPath: string) =>
    ipcRenderer.invoke(IPC.JUPYTER_START, envPath),

  stopJupyter: () =>
    ipcRenderer.invoke(IPC.JUPYTER_STOP),

  getJupyterStatus: () =>
    ipcRenderer.invoke(IPC.JUPYTER_STATUS),

  onJupyterStatus: (callback: (status: { running: boolean; url: string | null }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: { running: boolean; url: string | null }): void => callback(status)
    ipcRenderer.on(IPC.JUPYTER_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.JUPYTER_STATUS, handler)
  },

  // File system
  openDialog: (options?: { filters?: { name: string; extensions: string[] }[]; properties?: string[] }) =>
    ipcRenderer.invoke(IPC.FS_OPEN_DIALOG, options),

  readDir: (dirPath: string) =>
    ipcRenderer.invoke(IPC.FS_READ_DIR, dirPath),

  readFile: (filePath: string) =>
    ipcRenderer.invoke(IPC.FS_READ_FILE, filePath),

  // Training
  startTraining: (config: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.BACKEND_INVOKE, 'train.start', { config }),

  cancelTraining: () =>
    ipcRenderer.invoke(IPC.BACKEND_INVOKE, 'train.cancel'),

  getTrainingStatus: () =>
    ipcRenderer.invoke(IPC.BACKEND_INVOKE, 'train.status'),

  onTrainingProgress: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { topic: string; payload: unknown }): void => {
      if (data.topic === 'train.progress') {
        callback(data.payload)
      }
    }
    ipcRenderer.on(IPC.BACKEND_NOTIFICATION, handler)
    return () => ipcRenderer.removeListener(IPC.BACKEND_NOTIFICATION, handler)
  },

  onTrainingDone: (callback: (result: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { topic: string; payload: unknown }): void => {
      if (data.topic === 'train.done') {
        callback(data.payload)
      }
    }
    ipcRenderer.on(IPC.BACKEND_NOTIFICATION, handler)
    return () => ipcRenderer.removeListener(IPC.BACKEND_NOTIFICATION, handler)
  },

  // Updater
  downloadUpdate: () =>
    ipcRenderer.invoke(IPC.UPDATER_DOWNLOAD),

  installUpdate: () =>
    ipcRenderer.invoke(IPC.UPDATER_INSTALL),

  onUpdaterEvent: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
    ipcRenderer.on(IPC.UPDATER_EVENT, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATER_EVENT, handler)
  },

  // App info
  getHomeDir: () =>
    ipcRenderer.invoke(IPC.APP_HOME_DIR),

  // Window controls
  minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.send(IPC.WINDOW_MAXIMIZE),
  close: () => ipcRenderer.send(IPC.WINDOW_CLOSE)
}

contextBridge.exposeInMainWorld('ducky', duckyApi)

export type DuckyApi = typeof duckyApi
