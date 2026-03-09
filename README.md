# <div align="center">cdx</div>

<div align="center">
  <strong>A local-first control plane for people who run more than one Codex account.</strong>
</div>

<div align="center">
  Launch Codex with the right profile, inspect usage without digging through auth files,
  and keep shared <code>AGENTS.md</code> wiring visible from one dashboard.
</div>

<br />

<div align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-111111?style=for-the-badge&logo=node.js&logoColor=5FA04E" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-111111?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-111111?style=for-the-badge&logo=vite&logoColor=646CFF" />
  <img alt="Platforms" src="https://img.shields.io/badge/Linux%20%26%20macOS-supported-111111?style=for-the-badge" />
</div>

## Why cdx

Most Codex setups start as shell aliases, duplicate config folders, and scattered notes
about which account is logged in where. `cdx` turns that into an explicit workflow:

- profile-aware `codex` launching
- one place to inspect account and usage state
- shared `AGENTS.md` management across repos
- a browser dashboard for common actions that do not need a full terminal

## What It Ships Today

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

### Web dashboard

- overview of profiles, live usage, AGENTS coverage, and doctor status
- beginner-friendly run picker for starting a Codex session
- create profile action
- login and logout session start
- run session start with status polling
- doctor refresh
- shared `AGENTS.md` preparation

## Quick Start

### Requirements

- Node.js 20+
- `codex` available in `PATH`
- Linux or macOS

### Install

```bash
npm install
npm run build
```

### Start the dashboard

```bash
npm run dev
```

This starts the Vite UI and the local API layer used by the dashboard.

### Use the CLI locally

```bash
node dist-cli/index.js --help
```

If you want a local command during development:

```bash
npm link
cdx doctor
```

## First Run Flow

```bash
cdx create work
cdx login work
cdx usage work
cdx run work
```

If you manage multiple Codex homes already, `cdx` can also discover legacy profiles such
as `~/.codex` and `~/.codex2`.

## Command Reference

| Command | Purpose |
| --- | --- |
| `cdx run [profile] [codex args...]` | Launch `codex` with the selected profile's `CODEX_HOME` |
| `cdx usage [profile] [--json]` | Read usage snapshots for one profile or all profiles |
| `cdx agents edit --global` | Prepare and open the shared global `AGENTS.md` |
| `cdx agents status` | Show project and global AGENTS wiring |
| `cdx ls` | List discovered profiles |
| `cdx whoami [profile]` | Show account metadata for a profile |
| `cdx login <profile>` | Start a login flow for a profile |
| `cdx logout <profile>` | Start a logout flow for a profile |
| `cdx create <profile>` | Create a modern profile under `~/.cdx/profiles` |
| `cdx rm <profile> [--force]` | Remove a profile |
| `cdx doctor` | Run environment and setup checks |

## How the Dashboard Works

The web UI is not a separate backend service. During development and preview, the Vite
server exposes local endpoints that call the same profile and action logic used by the CLI.

- `GET /api/dashboard` aggregates profiles, usage, AGENTS state, and doctor hints
- `POST /api/run-sessions` starts a profile-scoped Codex run
- `POST /api/login-sessions` starts a login flow
- `POST /api/profiles/:id/logout` starts a logout flow
- `GET /api/action-sessions/:id` polls session progress
- `POST /api/agents/global-file` prepares the shared global `AGENTS.md`

That keeps the product local-first: no hosted control plane, no extra service to deploy,
and no need to duplicate business logic between the CLI and the browser layer.

## Usage Source

`cdx usage` and the dashboard primarily read usage from the ChatGPT backend usage endpoint
using each profile's stored auth state. The older `/status` scraping path still exists for
compatibility, but it is not the primary source.

## Current Limits

- the web UI does not provide a full interactive terminal yet
- long-running Codex flows still fit a real terminal better than the browser
- `agents edit --global` currently prepares the file and opens the local editor, not an in-browser editor
- Windows support is incomplete
- parts of the legacy `/status` path depend on terminal tooling that is not available on Windows

## Development

```bash
npm run typecheck
npm run lint
npm run build
```

The built CLI entrypoint is:

```bash
node dist-cli/index.js --help
```

## Roadmap Direction

- tighter multi-account operational visibility
- stronger session monitoring from the dashboard
- smoother profile onboarding for non-terminal-heavy users
- less manual AGENTS setup across repos

## Design Intent

The dashboard is intentionally warm and operational rather than generic admin UI. It is
meant to feel like a focused sidecar for Codex work:

- `cdx run`
- `cdx usage`
- `cdx agents edit --global`
- `cdx doctor`
