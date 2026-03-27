# Next release notes

## Added

- Interactive `cdx session` command to switch between shared global sessions and per-profile sessions.
- On first interactive Codex use, `cdx` now asks how sessions should be stored before continuing.

## Changed

- Global session mode now scans discovered Codex homes immediately and merges their sessions into `~/.cdx/sessions` when selected.
- Release workflow now publishes GitHub release bodies from repo-managed release note files.
