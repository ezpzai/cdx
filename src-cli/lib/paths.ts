import os from "node:os";
import path from "node:path";

export function getCdxHome(): string {
  return process.env.CDX_HOME || path.join(os.homedir(), ".cdx");
}

export function getProfilesRoot(): string {
  return process.env.CDX_PROFILES_ROOT || path.join(os.homedir(), ".cdx", "profiles");
}

export function getCdxConfigPath(): string {
  return process.env.CDX_CONFIG_PATH || path.join(getCdxHome(), "config.json");
}

export function getGlobalAgentsPath(): string {
  return path.join(getCdxHome(), "AGENTS.md");
}

export function getConfigPath(): string {
  return getCdxConfigPath();
}

export function getUsageScratchDir(): string {
  return path.join(os.tmpdir(), "cdx-usage");
}

export function getRemoteDataDir(): string {
  return path.join(getCdxHome(), "remote");
}

export function getRemoteDevicesPath(): string {
  return path.join(getRemoteDataDir(), "trusted-devices.json");
}
