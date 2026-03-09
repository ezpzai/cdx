# cdx

`cdx` is a Codex sidecar for teams or individuals who juggle multiple Codex accounts and want a friendlier control surface than shell aliases.

Today the project already ships both:

- a Node CLI for profile-based Codex workflows
- a Vite web dashboard for visibility and common actions

## What works today

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

- overview of profiles, usage, AGENTS state, and doctor output
- beginner-friendly `cdx run` picker UI
- create profile action
- login/logout action start
- run session start with status polling
- doctor refresh
- global `AGENTS.md` preparation

## Current web behavior and limits

The web UI now calls real local APIs exposed by the Vite dev server. It can start `run`, `login`, and `logout` actions and poll their session status.

Current limits:

- the web UI does not provide a full interactive terminal yet
- long-running Codex flows still make the most sense in a real terminal
- `agents edit --global` is currently implemented as “prepare the shared file and show its path”, not as an in-browser editor

## Usage data source

`cdx usage` and the dashboard currently read usage from the ChatGPT backend usage endpoint using each profile's stored auth state. The older `/status` scraping path still exists in the codebase, but it is not the primary source anymore.

## Development

```bash
npm install
npm run dev
npm run build
```

## Build

```bash
npm run build
```

After building, the CLI entrypoint is:

```bash
node dist-cli/index.js --help
```

## Platform notes

- Linux and macOS are the primary targets right now
- Windows support is incomplete
- parts of the legacy `/status`-based usage path depend on terminal tooling that is not implemented for Windows yet

## Design direction

The dashboard is intentionally inspired by the warm, operational feel of the CCS UI, but refocused around Codex-specific workflows:

- `cdx run`
- `cdx usage`
- `cdx agents edit --global`
- `cdx doctor`
