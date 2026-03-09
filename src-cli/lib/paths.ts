import os from "node:os";
import path from "node:path";

export function getCdxHome(): string {
  return process.env.CDX_HOME || path.join(os.homedir(), ".cdx");
}

export function getProfilesRoot(): string {
  return process.env.CDX_PROFILES_ROOT || path.join(os.homedir(), ".cdx", "profiles");
}

export function getGlobalAgentsPath(): string {
  return path.join(getCdxHome(), "AGENTS.md");
}

export function getUsageScratchDir(): string {
  return path.join(os.tmpdir(), "cdx-usage");
}
