"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const child_process = require("child_process");
const events = require("events");
const fs = require("fs");
const si = require("systeminformation");
const electronUpdater = require("electron-updater");
const promises = require("fs/promises");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({
        openAtLogin: auto,
        path: process.execPath
      });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
function createWindow() {
  const mainWindow2 = new electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });
  mainWindow2.on("ready-to-show", () => {
    mainWindow2.show();
  });
  mainWindow2.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev) {
    mainWindow2.webContents.openDevTools({ mode: "detach" });
  }
  return mainWindow2;
}
const IPC = {
  BACKEND_INVOKE: "backend:invoke",
  BACKEND_STATUS: "backend:status",
  BACKEND_NOTIFICATION: "backend:notification",
  MONITOR_TELEMETRY: "monitor:telemetry",
  MONITOR_SNAPSHOT: "monitor:snapshot",
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
function registerAllHandlers() {
  electron.ipcMain.on(IPC.WINDOW_MINIMIZE, () => getMainWindow()?.minimize());
  electron.ipcMain.on(IPC.WINDOW_MAXIMIZE, () => {
    const win = getMainWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });
  electron.ipcMain.on(IPC.WINDOW_CLOSE, () => getMainWindow()?.close());
  electron.ipcMain.handle(IPC.BACKEND_INVOKE, async (_event, method, params) => {
    throw new Error("Backend not initialized");
  });
  electron.ipcMain.handle(IPC.BACKEND_STATUS, () => {
    return { connected: false, pid: null };
  });
  electron.ipcMain.handle(IPC.PTY_CREATE, async (_event, opts) => {
    throw new Error("PTY manager not initialized");
  });
  electron.ipcMain.on(IPC.PTY_WRITE, (_event, id, data) => {
  });
  electron.ipcMain.on(IPC.PTY_RESIZE, (_event, id, cols, rows) => {
  });
  electron.ipcMain.on(IPC.PTY_KILL, (_event, id) => {
  });
  electron.ipcMain.handle(IPC.JUPYTER_START, async (_event, envPath) => {
    throw new Error("Jupyter manager not initialized");
  });
  electron.ipcMain.handle(IPC.JUPYTER_STOP, async () => {
  });
  electron.ipcMain.handle(IPC.JUPYTER_STATUS, () => {
    return { running: false, url: null };
  });
  electron.ipcMain.handle(IPC.FS_OPEN_DIALOG, async (_event, options) => {
    const result = await electron.dialog.showOpenDialog({
      filters: options.filters ?? [{ name: "All Files", extensions: ["*"] }],
      properties: options.properties ?? ["openFile"]
    });
    return result;
  });
  electron.ipcMain.handle(IPC.FS_READ_DIR, async (_event, dirPath) => {
    const entries = await promises.readdir(dirPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: path.join(dirPath, e.name)
    }));
  });
  electron.ipcMain.handle(IPC.FS_READ_FILE, async (_event, filePath) => {
    return promises.readFile(filePath, "utf-8");
  });
}
class RpcClient extends events.EventEmitter {
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  buffer = "";
  proc;
  constructor(proc) {
    super();
    this.proc = proc;
    proc.stdout?.setEncoding("utf-8");
    proc.stdout?.on("data", (chunk) => {
      this.buffer += chunk;
      this.drain();
    });
  }
  drain() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        this.handleMessage(msg);
      } catch {
        console.error("[rpc] invalid JSON:", trimmed);
      }
    }
  }
  handleMessage(msg) {
    if ("id" in msg && msg.id != null) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`RPC ${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if ("method" in msg && msg.method === "notify") {
      const notif = msg;
      this.emit("notification", notif.params.topic, notif.params.payload);
    }
  }
  async call(method, params, timeoutMs = 3e4) {
    const id = this.nextId++;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const line = JSON.stringify(request) + "\n";
      this.proc.stdin?.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }
  isConnected() {
    return this.proc.exitCode == null;
  }
}
function locateBackend() {
  if (is.dev) {
    const pythonCmd = process.env.DUCKY_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
    path.join(electron.app.getAppPath(), "backend");
    return {
      cmd: pythonCmd,
      args: ["-m", "ducky_backend"]
    };
  }
  const exeName = process.platform === "win32" ? "ducky-backend.exe" : "ducky-backend";
  const exePath = path.join(process.resourcesPath, "backend", exeName);
  if (!fs.existsSync(exePath)) {
    throw new Error(`Backend executable not found: ${exePath}`);
  }
  return { cmd: exePath, args: [] };
}
class BackendProcess extends events.EventEmitter {
  process = null;
  rpc = null;
  restartCount = 0;
  maxRestarts = 3;
  restartDelay = 1e3;
  stopping = false;
  async start() {
    const exe = locateBackend();
    this.spawnProcess(exe.cmd, exe.args);
  }
  async spawnProcess(cmd, args) {
    const backendDir = path.join(electron.app.getAppPath(), "backend");
    const pythonPath = process.env.PYTHONPATH ? `${backendDir}:${process.env.PYTHONPATH}` : backendDir;
    this.process = child_process.spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONHOME: void 0,
        PYTHONPATH: pythonPath
      }
    });
    this.rpc = new RpcClient(this.process);
    this.rpc.on("notification", (topic, payload) => {
      const win = getMainWindow();
      if (win) {
        win.webContents.send(IPC.BACKEND_NOTIFICATION, { topic, payload });
      }
    });
    this.process.on("exit", (code) => {
      if (!this.stopping) {
        this.handleCrash(code);
      }
    });
    this.process.stderr?.on("data", (data) => {
      console.error("[backend stderr]", data.toString().trim());
    });
    try {
      await this.rpc.call("ping", {}, 1e4);
      this.restartCount = 0;
      this.emit("statusChange", this.getStatus());
    } catch {
      console.error("[backend] ping failed after spawn");
      this.handleCrash(1);
    }
  }
  async handleCrash(code) {
    if (this.restartCount >= this.maxRestarts) {
      console.error("[backend] max restarts reached, giving up");
      this.emit("statusChange", this.getStatus());
      return;
    }
    this.restartCount++;
    const delay = this.restartDelay * Math.pow(2, this.restartCount - 1);
    console.warn(`[backend] crashed (code=${code}), restarting in ${delay}ms (attempt ${this.restartCount}/${this.maxRestarts})`);
    this.emit("statusChange", this.getStatus());
    setTimeout(() => {
      if (!this.stopping) {
        const exe = locateBackend();
        this.spawnProcess(exe.cmd, exe.args);
      }
    }, delay);
  }
  async invoke(method, params) {
    if (!this.rpc) throw new Error("Backend not connected");
    return this.rpc.call(method, params ?? {});
  }
  getStatus() {
    return {
      connected: this.rpc?.isConnected() ?? false,
      pid: this.process?.pid ?? null,
      restartCount: this.restartCount
    };
  }
  stop() {
    this.stopping = true;
    if (this.process) {
      try {
        if (process.platform === "win32") {
          child_process.spawn("taskkill", ["/PID", String(this.process.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          this.process.kill("SIGTERM");
        }
      } catch {
      }
      this.process = null;
      this.rpc = null;
    }
  }
}
const RING_SIZE = 300;
const POLL_INTERVAL = 1e3;
class MonitorService {
  timer = null;
  ring = [];
  ringIndex = 0;
  cpuInfo = null;
  win;
  constructor(win) {
    this.win = win;
  }
  async start() {
    const cpu = await si.cpu();
    this.cpuInfo = {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      processors: cpu.processors
    };
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL);
    await this.poll();
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  async poll() {
    try {
      const [load, mem, graphics, temp] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.graphics(),
        this.safeTemp()
      ]);
      const sample = {
        timestamp: Date.now(),
        cpu: {
          totalLoad: load.currentLoad,
          coreLoads: load.cpus.map((c) => c.load)
        },
        cpuTemp: {
          main: temp.main,
          cores: temp.cores,
          available: temp.available
        },
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
          swapTotal: mem.swaptotal,
          swapUsed: mem.swapused,
          swapFree: mem.swapused > 0 ? mem.swaptotal - mem.swapused : mem.swaptotal,
          percent: mem.total > 0 ? mem.used / mem.total * 100 : 0
        },
        gpus: graphics.controllers.map((c) => ({
          model: c.model,
          vendor: c.vendor,
          vram: c.vram ?? null,
          vramUsed: c.memoryUsed ?? null,
          utilization: c.utilizationGpu ?? null,
          temperature: c.temperatureGpu ?? null,
          driver: c.driverVersion ?? ""
        }))
      };
      if (this.ring.length < RING_SIZE) {
        this.ring.push(sample);
      } else {
        this.ring[this.ringIndex] = sample;
      }
      this.ringIndex = (this.ringIndex + 1) % RING_SIZE;
      this.win.webContents.send(IPC.MONITOR_TELEMETRY, sample);
    } catch (err) {
      console.error("[monitor] poll error:", err);
    }
  }
  async safeTemp() {
    try {
      const t = await si.cpuTemperature();
      return {
        main: t.main > 0 ? t.main : null,
        cores: t.cores?.map((c) => c > 0 ? c : null) ?? [],
        available: t.main > 0
      };
    } catch {
      return { main: null, cores: [], available: false };
    }
  }
  getSnapshot() {
    return { cpuInfo: this.cpuInfo, ring: [...this.ring] };
  }
}
let checkInterval = null;
function initUpdater(mainWindow2) {
  if (is.dev) return;
  electronUpdater.autoUpdater.logger = console;
  electronUpdater.autoUpdater.autoDownload = false;
  electronUpdater.autoUpdater.autoInstallOnAppQuit = true;
  electronUpdater.autoUpdater.on("checking-for-update", () => {
    console.log("Checking for update...");
  });
  electronUpdater.autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info.version);
    mainWindow2.webContents.send(IPC.UPDATER_EVENT, { type: "update-available", info });
  });
  electronUpdater.autoUpdater.on("update-not-available", () => {
    console.log("No update available");
    mainWindow2.webContents.send(IPC.UPDATER_EVENT, { type: "update-not-available" });
  });
  electronUpdater.autoUpdater.on("error", (err) => {
    console.error("Updater error:", err);
    mainWindow2.webContents.send(IPC.UPDATER_EVENT, { type: "error", message: err.message });
  });
  electronUpdater.autoUpdater.on("download-progress", (progress) => {
    mainWindow2.webContents.send(IPC.UPDATER_EVENT, {
      type: "download-progress",
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred
      }
    });
  });
  electronUpdater.autoUpdater.on("update-downloaded", (info) => {
    console.log("Update downloaded:", info.version);
    mainWindow2.webContents.send(IPC.UPDATER_EVENT, { type: "update-downloaded", info });
  });
  electron.ipcMain.handle(IPC.UPDATER_DOWNLOAD, async () => {
    await electronUpdater.autoUpdater.downloadUpdate();
  });
  electron.ipcMain.handle(IPC.UPDATER_INSTALL, () => {
    electronUpdater.autoUpdater.quitAndInstall();
  });
  electronUpdater.autoUpdater.checkForUpdates().catch((err) => {
    console.error("Failed to check for updates:", err);
  });
  checkInterval = setInterval(() => {
    electronUpdater.autoUpdater.checkForUpdates().catch(() => {
    });
  }, 4 * 60 * 60 * 1e3);
}
function stopUpdater() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
let mainWindow = null;
let backend = null;
let monitor = null;
async function onReady() {
  electronApp.setAppUserModelId("com.ducky.app");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  registerAllHandlers();
  mainWindow = createWindow();
  backend = new BackendProcess();
  await backend.start();
  monitor = new MonitorService(mainWindow);
  monitor.start();
  initUpdater(mainWindow);
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(onReady);
electron.app.on("window-all-closed", () => {
  monitor?.stop();
  backend?.stop();
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});
electron.app.on("before-quit", () => {
  stopUpdater();
  monitor?.stop();
  backend?.stop();
});
function getMainWindow() {
  return mainWindow;
}
exports.getMainWindow = getMainWindow;
