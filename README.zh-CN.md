<div align="center">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.es.md">Español</a>
</div>

# cdx

**让 Codex 更轻松，也能在移动端继续用。**

<div align="center">
  <img src="./assets/social-preview.png" alt="cdx social preview" width="100%" />
</div>

## 快速开始

### 要求

- Node.js 20+
- 已安装 Codex：`npm install -g @openai/codex`
- 需要安装 `cloudflared`
- 支持 Linux、macOS

### 安装

```bash
npm install -g @ezpzai/cdx
```

### 安装 Cloudflare Quick Tunnel

`cdx remote` 默认使用 Cloudflare Quick Tunnel。

macOS:

```bash
brew install cloudflared
```

Linux:

```bash
curl -Lo cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

### 首次运行

```bash
cdx login {profile} // 首次需要注册
cdx run {profile}
cdx remote // 移动端访问
cdx usage // 查看 usage
```

## 主要命令

| 命令 | 说明 |
| --- | --- |
| `cdx remote [profile] [codex args...] [--mode <safe\|balanced\|yolo>] [--tunnel <cloudflare\|none>] [--no-qr] [--lan]` | 将桌面上运行的 Codex 会话继续到移动端 Web 界面。 |
| `cdx run [profile] [codex args...] [--mode <safe\|balanced\|yolo>]` | 使用所选 profile 的 `CODEX_HOME` 启动 Codex。 |
| `cdx usage [profile] [--json]` | 查看各个 profile 的 auth 和 quota 状态。 |
| `cdx mode` | 显示当前默认运行模式。 |
| `cdx mode set <safe\|balanced\|yolo> [--profile <profile>]` | 保存全局或 profile 级别的默认运行模式。 |
| `cdx login <profile>` | 创建新 profile 或登录已有 profile。 |
| `cdx logout <profile>` | 启动某个 profile 的登出流程。 |
| `cdx ls` | 显示已发现的 profile。 |
| `cdx rm <profile> [--force]` | 删除某个 profile。 |
| `cdx agents edit --global` | 准备并打开共享全局 `AGENTS.md`。 |
| `cdx agents status` | 检查当前仓库与全局 `AGENTS.md` 的连接状态。 |

`cdx remote` 默认使用 `Cloudflare Quick Tunnel` 作为外部路径。

- 外部链接：`cdx remote <profile>`
- 同一 Wi-Fi / LAN：`cdx remote <profile> --tunnel none --lan`
- 仅本机：`cdx remote <profile> --tunnel none`
