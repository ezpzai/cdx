<div align="center">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.es.md">Español</a>
</div>

# <div align="center">cdx</div>

<div align="center">
  <strong>为同时管理多个 Codex 账号的人准备的本地优先控制台。</strong>
</div>

<div align="center">
  用正确的 profile 启动 Codex，不必翻找认证文件就能查看用量，
  并在一个仪表盘里管理共享 <code>AGENTS.md</code> 的连接状态。
</div>

<br />

<div align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-111111?style=for-the-badge&logo=node.js&logoColor=5FA04E" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-111111?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-111111?style=for-the-badge&logo=vite&logoColor=646CFF" />
  <img alt="Platforms" src="https://img.shields.io/badge/Linux%20%26%20macOS-supported-111111?style=for-the-badge" />
</div>

<br />

<div align="center">
  <a href="#快速开始"><img alt="Quick Start" src="https://img.shields.io/badge/Quick%20Start-18181B?style=flat-square&logo=rocket&logoColor=white" /></a>
  <a href="#命令参考"><img alt="CLI" src="https://img.shields.io/badge/CLI-18181B?style=flat-square&logo=gnubash&logoColor=white" /></a>
  <a href="#仪表盘如何工作"><img alt="Dashboard" src="https://img.shields.io/badge/Dashboard-18181B?style=flat-square&logo=react&logoColor=61DAFB" /></a>
  <a href="#路线方向"><img alt="Roadmap" src="https://img.shields.io/badge/Roadmap-18181B?style=flat-square&logo=github&logoColor=white" /></a>
</div>

<div align="center">
  <sub>本地优先，按 profile 运行，为需要更高可见性而不是更多 alias 的 Codex 用户准备。</sub>
</div>

## 亮点

| 按 profile 运行 | 用量可见性 | 共享 AGENTS 连接 | 本地仪表盘 |
| --- | --- | --- | --- |
| 始终用正确的 `CODEX_HOME` 启动 `codex` | 无需手动打开认证文件即可查看实时用量 | 在多个仓库之间维持同一个 `AGENTS.md` | 不需要完整终端的操作直接在浏览器处理 |

## 典型使用流程

| 场景 | cdx 提供的帮助 |
| --- | --- |
| 同时使用个人和工作 Codex 账号的开发者 | 不必手动切环境变量就能干净切换 profile |
| 管理多个 Codex home 的团队负责人 | 快速查看谁已登录、当前计划以及哪些 profile 快接近限额 |
| 维护多个仓库的环境 | 复用一个共享 `AGENTS.md`，不用在每个仓库重复设置 |
| 偏浏览器的操作方式 | 不必完全依赖终端，也能完成 run、login、doctor 刷新等常见操作 |

## 架构概览

```text
旧 home (~/.codex, ~/.codex2, ...)
         +
现代 home (~/.cdx/profiles/*)
         |
         v
    cdx profile 发现
         |
         +-------------------+
         |                   |
         v                   v
      CLI 命令           Vite 本地 API
         |                   |
         +---------+---------+
                   |
                   v
   共用动作: run / usage / login / logout /
   doctor / agents / profile 管理
                   |
                   v
        Codex CLI + 本地仪表盘
```

## 适合这些情况

- 你在同一台机器上维护多个 Codex 身份
- 你希望在开始长会话前先看到账号状态和用量
- 你想要一个更轻量的浏览器控制面来做常见操作
- 你想在多个仓库之间统一共享 `AGENTS.md`，而不是继续依赖临时脚本

## 为什么使用 cdx

大多数 Codex 多账号环境一开始都只是 shell alias、复制出来的配置目录，以及一些记录“哪个账号登录到哪里”的备注。
`cdx` 把这些零散做法变成清晰的工作流。

- 按 profile 启动 `codex`
- 在一个地方查看账号状态和用量
- 在多个仓库之间管理共享 `AGENTS.md`
- 为不需要完整终端的常见操作提供浏览器仪表盘

## 当前已提供的能力

### CLI

- `cdx run [profile] [codex args...]`
- `cdx usage [profile] [--json]`
- `cdx agents edit --global`
- `cdx agents status`
- `cdx ls`
- `cdx whoami [profile]`
- `cdx login <profile>`
- `cdx logout <profile>`
- `cdx create <profile>`
- `cdx rm <profile> [--force]`
- `cdx doctor`

### Web 仪表盘

- 查看 profile、实时用量、AGENTS 覆盖状态和 doctor 状态
- 用于启动 Codex 会话的 run picker
- 创建 profile
- 启动登录和登出会话
- 启动 run 会话并轮询状态
- 刷新 doctor
- 准备共享 `AGENTS.md`

## 能力地图

| 领域 | 当前已包含 |
| --- | --- |
| Profile 生命周期 | 创建、列出、查看、删除 |
| 账号访问 | 登录、登出、认证元数据可见性 |
| 用量操作 | 实时用量抓取、单 profile 和多 profile 视图 |
| 仓库体验 | 全局 AGENTS 准备与状态检查 |
| 会话控制 | 从仪表盘发起 Codex run 并轮询动作状态 |

## 快速开始

### 要求

- Node.js 20+
- `codex` 已在 `PATH` 中
- Linux 或 macOS

### 安装

```bash
npm install
npm run build
```

### 启动仪表盘

```bash
npm run dev
```

这会同时启动 Vite UI 和仪表盘使用的本地 API 层。

### 使用 CLI

```bash
node dist-cli/index.js --help
```

如果你想在开发时直接使用本地命令：

```bash
npm link
cdx doctor
```

## 首次使用流程

```bash
cdx create work
cdx login work
cdx usage work
cdx run work
```

如果你已经有多个 Codex home，`cdx` 也能发现 `~/.codex`、`~/.codex2` 这类旧式 profile。

## 命令参考

| 命令 | 作用 |
| --- | --- |
| `cdx run [profile] [codex args...]` | 使用所选 profile 的 `CODEX_HOME` 启动 `codex` |
| `cdx usage [profile] [--json]` | 读取单个或全部 profile 的用量快照 |
| `cdx agents edit --global` | 准备并打开共享全局 `AGENTS.md` |
| `cdx agents status` | 显示项目和全局 AGENTS 连接状态 |
| `cdx ls` | 列出已发现的 profile |
| `cdx whoami [profile]` | 显示 profile 的账号元数据 |
| `cdx login <profile>` | 启动 profile 登录流程 |
| `cdx logout <profile>` | 启动 profile 登出流程 |
| `cdx create <profile>` | 在 `~/.cdx/profiles` 下创建现代 profile |
| `cdx rm <profile> [--force]` | 删除 profile |
| `cdx doctor` | 运行环境与配置检查 |

## 仪表盘如何工作

Web UI 不是独立的后端服务。在开发和预览环境下，Vite 服务器会暴露本地接口，并调用与 CLI 相同的 profile 和 action 逻辑。

- `GET /api/dashboard` 聚合 profile、用量、AGENTS 状态和 doctor 提示
- `POST /api/run-sessions` 启动某个 profile 的 Codex run
- `POST /api/login-sessions` 启动登录流程
- `POST /api/profiles/:id/logout` 启动登出流程
- `GET /api/action-sessions/:id` 轮询会话进度
- `POST /api/agents/global-file` 准备共享全局 `AGENTS.md`

这种方式保持了本地优先：不需要托管控制平面，不需要额外部署服务，也不用在 CLI 和浏览器层之间复制业务逻辑。

## 用量来源

`cdx usage` 和仪表盘主要通过每个 profile 已保存的认证状态，从 ChatGPT 后端 usage 接口读取数据。
旧的 `/status` 抓取路径仍保留用于兼容，但已不是主要路径。

## 当前限制

- Web UI 还不提供完整的交互式终端
- 长时间运行的 Codex 流程仍然更适合真实终端
- `agents edit --global` 目前是准备文件并打开本地编辑器，而不是浏览器内编辑器
- Windows 支持尚未完善
- 旧 `/status` 路径的一部分依赖于 Windows 上不可用的终端工具

## 开发

```bash
npm run typecheck
npm run lint
npm run build
```

构建后的 CLI 入口：

```bash
node dist-cli/index.js --help
```

## 路线方向

- 更强的多账号运行可见性
- 更完整的仪表盘会话监控
- 为不重度依赖终端的用户优化 profile onboarding
- 减少跨仓库 AGENTS 设置的手工工作

## 设计意图

这个仪表盘刻意避免做成普通后台面板，而更像一个有操作感的 Codex sidecar。

- `cdx run`
- `cdx usage`
- `cdx agents edit --global`
- `cdx doctor`
