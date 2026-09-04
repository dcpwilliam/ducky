"use strict";
const electron = require("electron");
const IPC = {
  BACKEND_INVOKE: "backend:invoke",
  BACKEND_STATUS: "backend:status",
  BACKEND_NOTIFICATION: "backend:notification",
  MONITOR_TELEMETRY: "monitor:telemetry",
  PTY_CREATE: "pty:create",
  PTY_WRITE: "pty:write",
  PTY_RESIZE: "pty:resize",
  PTY_KILL: "pty:kill",
  PTY_DATA: "pty:data",
  JUPYTER_START: "jupyter:start",
  JUPYTER_STOP: "jupyter:stop",
  JUPYTER_STATUS: "jupyter:status",
  FS_OPEN_DIALOG: "fs:openDialog",
  FS_READ_DIR: "fs:readDir",
  FS_READ_FILE: "fs:readFile",
  UPDATER_DOWNLOAD: "updater:download",
  UPDATER_INSTALL: "updater:install",
  UPDATER_EVENT: "updater:event",
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_MAXIMIZE: "window:maximize",
  WINDOW_CLOSE: "window:close"
};
const duckyApi = {
  // Backend RPC
  invokeRpc: (method, params) => electron.ipcRenderer.invoke(IPC.BACKEND_INVOKE, method, params),
  getBackendStatus: () => electron.ipcRenderer.invoke(IPC.BACKEND_STATUS),
  onBackendNotification: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on(IPC.BACKEND_NOTIFICATION, handler);
    return () => electron.ipcRenderer.removeListener(IPC.BACKEND_NOTIFICATION, handler);
  },
  // Monitor
  onTelemetry: (callback) => {
    const handler = (_event, sample) => callback(sample);
    electron.ipcRenderer.on(IPC.MONITOR_TELEMETRY, handler);
    return () => electron.ipcRenderer.removeListener(IPC.MONITOR_TELEMETRY, handler);
  },
  // PTY
  createPty: (opts) => electron.ipcRenderer.invoke(IPC.PTY_CREATE, opts),
  writePty: (id, data) => electron.ipcRenderer.send(IPC.PTY_WRITE, id, data),
  resizePty: (id, cols, rows) => electron.ipcRenderer.send(IPC.PTY_RESIZE, id, cols, rows),
  killPty: (id) => electron.ipcRenderer.send(IPC.PTY_KILL, id),
  onPtyData: (callback) => {
    const handler = (_event, id, data) => callback(id, data);
    electron.ipcRenderer.on(IPC.PTY_DATA, handler);
    return () => electron.ipcRenderer.removeListener(IPC.PTY_DATA, handler);
  },
  // Jupyter
  startJupyter: (envPath) => electron.ipcRenderer.invoke(IPC.JUPYTER_START, envPath),
  stopJupyter: () => electron.ipcRenderer.invoke(IPC.JUPYTER_STOP),
  getJupyterStatus: () => electron.ipcRenderer.invoke(IPC.JUPYTER_STATUS),
  onJupyterStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    electron.ipcRenderer.on(IPC.JUPYTER_STATUS, handler);
    return () => electron.ipcRenderer.removeListener(IPC.JUPYTER_STATUS, handler);
  },
  // File system
  openDialog: (options) => electron.ipcRenderer.invoke(IPC.FS_OPEN_DIALOG, options),
  readDir: (dirPath) => electron.ipcRenderer.invoke(IPC.FS_READ_DIR, dirPath),
  readFile: (filePath) => electron.ipcRenderer.invoke(IPC.FS_READ_FILE, filePath),
  // Training
  startTraining: (config) => electron.ipcRenderer.invoke(IPC.BACKEND_INVOKE, "train.start", config),
  cancelTraining: () => electron.ipcRenderer.invoke(IPC.BACKEND_INVOKE, "train.cancel"),
  getTrainingStatus: () => electron.ipcRenderer.invoke(IPC.BACKEND_INVOKE, "train.status"),
  onTrainingProgress: (callback) => {
    const handler = (_event, data) => {
      if (data.topic === "train.progress") {
        callback(data.payload);
      }
    };
    electron.ipcRenderer.on(IPC.BACKEND_NOTIFICATION, handler);
    return () => electron.ipcRenderer.removeListener(IPC.BACKEND_NOTIFICATION, handler);
  },
  onTrainingDone: (callback) => {
    const handler = (_event, data) => {
      if (data.topic === "train.done") {
        callback(data.payload);
      }
    };
    electron.ipcRenderer.on(IPC.BACKEND_NOTIFICATION, handler);
    return () => electron.ipcRenderer.removeListener(IPC.BACKEND_NOTIFICATION, handler);
  },
  // Updater
  downloadUpdate: () => electron.ipcRenderer.invoke(IPC.UPDATER_DOWNLOAD),
  installUpdate: () => electron.ipcRenderer.invoke(IPC.UPDATER_INSTALL),
  onUpdaterEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on(IPC.UPDATER_EVENT, handler);
    return () => electron.ipcRenderer.removeListener(IPC.UPDATER_EVENT, handler);
  },
  // Window controls
  minimize: () => electron.ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  maximize: () => electron.ipcRenderer.send(IPC.WINDOW_MAXIMIZE),
  close: () => electron.ipcRenderer.send(IPC.WINDOW_CLOSE)
};
electron.contextBridge.exposeInMainWorld("ducky", duckyApi);
