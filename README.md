<div align="center">
  <a href="./README.md">English</a> |
  <a href="./locale/README.ko.md">한국어</a> |
  <a href="./locale/README.zh-CN.md">简体中文</a> |
  <a href="./locale/README.ja.md">日本語</a> |
  <a href="./locale/README.es.md">Español</a>
</div>

# cdx

**Use Codex more easily, even from mobile.**

<div align="center">
  <img src="./assets/social-preview.png" alt="cdx social preview" width="100%" />
</div>

## Quick Start

### Requirements

- Node.js 20+
- Codex installed: `npm install -g @openai/codex`
- `cloudflared` required
- Linux and macOS supported

### Install

```bash
npm install -g @ezpzai/cdx
```

### Install Cloudflare Quick Tunnel

`cdx remote` uses Cloudflare Quick Tunnel by default.

* https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads

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

### First Run

```bash
cdx login {profile} // first-time setup
cdx run {profile}
cdx remote // mobile access
cdx usage // check usage
```

On the first interactive Codex command, `cdx` asks how sessions should be stored.

- `global`: immediately scans discovered Codex homes and merges their sessions into `~/.cdx/sessions`
- `profile`: keeps each profile's `CODEX_HOME/sessions` separate

## Main Commands

| Command | Description |
| --- | --- |
| `cdx remote [profile] [codex args...] [--mode <safe\|balanced\|yolo>] [--tunnel <cloudflare\|none>] [--no-qr] [--lan]` | Continue a desktop Codex session from a mobile web surface. |
| `cdx run [profile] [codex args...] [--mode <safe\|balanced\|yolo>]` | Launch Codex with the selected profile's `CODEX_HOME`. |
| `cdx usage [profile] [--json]` | Check auth and quota status for each profile. |
| `cdx mode` | Show the current default run mode. |
| `cdx mode set <safe\|balanced\|yolo> [--profile <profile>]` | Save a global or profile-level default run mode. |
| `cdx login <profile>` | Create a new profile or log into an existing one. |
| `cdx logout <profile>` | Start logout for a profile. |
| `cdx ls` | Show discovered profiles. |
| `cdx rm <profile> [--force]` | Remove a profile. |
| `cdx session [status]` | Show or interactively change session storage mode. Default: global `~/.cdx/sessions`. |
| `cdx agents edit --global` | Prepare and open the shared global `AGENTS.md`. |
| `cdx agents status` | Check project and global `AGENTS.md` wiring. |

`cdx remote` uses `Cloudflare Quick Tunnel` as the default external path.

- External link: `cdx remote <profile>`
- Same Wi-Fi / LAN: `cdx remote <profile> --tunnel none --lan`
- Local only: `cdx remote <profile> --tunnel none`

Release history lives on GitHub Releases:

- https://github.com/ezpzai/cdx/releases
