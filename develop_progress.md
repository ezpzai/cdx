# cdx Run Upgrade Progress

Last updated: 2026-03-09

## Current Status

- Overall state: implementation mostly landed
- Focus: verification, polish, and test coverage for the new CLI-first run-upgrade flow
- Documentation state: README updates added for the in-progress command surface and behavior summary
- Release state: command surface and core orchestration are implemented locally; broader regression coverage is still pending

## Progress Summary

- Completed
  - Run-upgrade scope and behavior are defined in [develop_plan.md](/home/hw/hellofuture/cdx/develop_plan.md).
  - User-facing documentation now covers `cdx run --mode`, the `cdx mode` command group, preflight behavior, low-quota warning, alternate profile suggestions, and the continuity handoff concept at a high level.
  - `cdx run` now resolves a cdx mode, blocks conflicting Codex execution flags, fetches usage snapshots, shows preflight output, warns on low quota, and allows manual alternate-profile selection.
  - `~/.cdx/config.json` state handling is implemented for global defaults, per-profile defaults, low-quota preference ordering, and recent handoff metadata.
  - `cdx mode` and `cdx mode set` are implemented.
  - Failed runs now capture bounded recent output and can start a follow-on run with a continuity handoff prompt block.
  - Profile removal now clears related run-upgrade state from the global config.
- Next
  - Exercise more real-world `codex run` scenarios against live profiles to harden prompt injection and alternate-profile flow.
  - Add core behavior, quota guard, preflight, handoff, and regression tests.
  - Do a final wording pass once the implementation edge cases are settled.

## Checklist Aligned To develop_plan.md

- [x] Define the run-upgrade scope and target UX in [develop_plan.md](/home/hw/hellofuture/cdx/develop_plan.md).
- [x] Document the planned `cdx mode` commands and `cdx run --mode` flow in the README files.
- [x] Rework `cdx run` into the new orchestration flow with resolved mode selection.
- [x] Add config/state storage for global defaults, per-profile defaults, preferred alternate profiles, and recent handoff metadata.
- [x] Add the `cdx mode` and `cdx mode set` command group.
- [x] Always show preflight details for profile, mode, quota, auth, and alternate candidates.
- [x] Add the low-quota warning threshold and the continue-or-switch interaction.
- [x] Rank alternate profiles by saved preference first, then available quota.
- [x] Capture recent run metadata needed for continuity handoff.
- [x] Start a fresh follow-on run with a bounded handoff block after quota/auth interruption.
- [x] Update CLI help/examples after implementation stabilizes.
- [ ] Add core behavior, quota guard, preflight, handoff, and regression tests from the plan.
