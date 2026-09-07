# Ducky

> System Monitor · Python 环境管理器 · Jupyter · MicroDuck 强化学习仿真 —— 一站式桌面工作台

Ducky 是一个基于 **Electron + React + TypeScript** 的跨平台（macOS / Windows / Linux）桌面应用，把本地系统监控、Python 环境与包管理、Jupyter 笔记本、本地大模型推理，以及 MicroDuck 机器人强化学习仿真整合在同一个界面里。后端由内嵌的**可移植 Python 运行时**驱动，无需用户单独安装 Python。

---

## ✨ 功能模块

| 模块 | 说明 |
| --- | --- |
| **System Monitor** | 实时遥测：CPU / GPU / 内存面板 + 时间序列图表（`uplot` 驱动），基于 `systeminformation`。 |
| **Python Env Manager** | 管理 conda / venv 环境，pip 安装 / 卸载 / 升级，PyPI 包检索与信息（`pypi` 服务）。 |
| **Jupyter** | 一键启动 / 停止本地 Jupyter，前端内嵌交互式笔记本。 |
| **Notebook** | 类 Jupyter 笔记本（`CellView` / `CodeEditor` / `OutputView`），内核实时执行；单元格内可直接调用 `llm`、`Agent`、`Tool` 等注入式 API，跑本地智能体。 |
| **Models** | 本地大模型管理：后端信息探测、模型列表 / 推荐、加载与生成（流式）。 |
| **MicroDuck Sim** | 机器人强化学习仿真：基于 `rapier3d` 物理 + `three.js` 渲染，Web Worker（`SimWorker`）跑仿真，`PolicyRuntime` 加载策略文件。规格见 `specs/duck_spec.json`（obs 24 维 / act 6 维 / 双足 6 关节）。 |
| **终端 (PTY)** | 内置 xterm 终端，直连本地 shell。 |

---

## 🧱 技术栈

- **前端**：Electron 33 · React 18 · TypeScript · Tailwind CSS · Zustand · React Router · lucide-react
- **构建**：[electron-vite](https://github.com/alex8088/electron-vite) · [electron-builder](https://www.electron.build/)
- **物理 / 渲染**：`@dimforge/rapier3d-compat` · `three`
- **后端**：Python（`ducky_backend` 包），通过 **JSON-RPC over stdio** 与 Electron 主进程通信
  - 服务：`conda` · `venv` · `pip` · `pypi` · `jupyter` · `training` · `llm` · `kernel`
  - 本地推理引擎：MLX（Apple Silicon）/ GGUF
  - 内嵌**可移植 Python 运行时**（随应用打包，见 `backend/dist`）

---

## 🚀 快速开始

### 前置条件

- Node.js ≥ 18（开发用）
- 无需本机 Python —— 应用会自带可移植运行时

### 安装依赖

```bash
npm install
```

### 开发模式（含热重载）

```bash
npm run dev
```

Electron 窗口会弹出，渲染进程默认监听 `http://localhost:5173`（端口被占用时自动顺延）。

### 生产构建

```bash
npm run build          # electron-vite build（main / preload / renderer）
npm run build:win      # 额外用 electron-builder 出 Windows nsis 安装包
```

打包产物（按平台）：

| 平台 | 目标 |
| --- | --- |
| macOS | `dmg` |
| Windows | `nsis` (x64) |
| Linux | `AppImage` |

> 打包时会通过 `extraResources` 把 `backend/dist`（Python 运行时）与 `resources/python` 一并打入应用。

### 类型检查

```bash
npm run typecheck     # 同时检查 node 与 web 两端
```

---

## 🔌 后端（Python）

后端以子进程方式随应用启动，主进程通过 `BackendProcess` + `RpcClient` 以 JSON-RPC 调用。常用方法：

- `ping` · `conda.*` · `venv.*` · `env.*` · `pypi.*`
- `jupyter.*` · `train.*`
- `llm.backendInfo` / `llm.listModels` / `llm.load` / `llm.generateStream` / `llm.status`
- `kernel.createSession` / `kernel.execute` / `kernel.variables`

无界面冒烟测试（不启动 Electron，直接拉起后端跑一组调用）：

```bash
python3 scripts/smoke_backend.py            # 含模型加载 / 智能体 / 流式生成
python3 scripts/smoke_backend.py --skip-model   # 跳过需要下载权重的步骤
```

> 开发模式下，HuggingFace 默认走 `hf-mirror.com` 镜像以加速模型下载（可用 `HF_ENDPOINT` / `DUCKY_HF_MIRROR` 覆盖）。

---

## 📁 目录结构（摘要）

```
ducky/
├── src/
│   ├── main/                 # Electron 主进程（backend / pty / jupyter / ipc）
│   ├── preload/             # 预加载脚本
│   ├── renderer/            # React 渲染进程
│   │   └── src/features/    # monitor · notebook · models · sim
│   └── shared/              # 主/渲染共享类型与 IPC 通道（@shared 别名）
├── backend/
│   └── ducky_backend/       # Python 后端（JSON-RPC 服务）
│       ├── services/        # conda / venv / pip / pypi / jupyter / training / llm / kernel
│       ├── llm/             # MLX / GGUF 推理引擎
│       └── dist/            # 内嵌可移植 Python 运行时（随包发布）
├── resources/python/         # 备用 Python 运行时资源
├── specs/                   # MicroDuck 仿真规格（duck_spec.json）
├── scripts/                 # 工具脚本（如 smoke_backend.py）
└── electron-builder.yml
```

---

## ⚠️ 开发注意事项

- **切勿将构建产物提交进 git 历史**：`dist/`、`node_modules/electron/` 含超大文件（安装包 / Electron 二进制），一旦进历史会被 GitHub 以 `GH001` 拒绝（>100MB 上限）。这些路径已在 `.gitignore` 中忽略，且历史已清理。
- `backend/dist/` 是**有意内嵌的可移植 Python 运行时**，需保留，不是误提交。
- `.workbuddy/`、`backend/.venv/`、`backend/build/`、`*.pyc`、`__pycache__/` 均已被忽略。

---

## 📄 License

MIT
