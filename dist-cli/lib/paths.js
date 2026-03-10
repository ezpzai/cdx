import os from "node:os";
import path from "node:path";
export function getCdxHome() {
    return process.env.CDX_HOME || path.join(os.homedir(), ".cdx");
}
export function getProfilesRoot() {
    return process.env.CDX_PROFILES_ROOT || path.join(os.homedir(), ".cdx", "profiles");
}
export function getCdxConfigPath() {
    return process.env.CDX_CONFIG_PATH || path.join(getCdxHome(), "config.json");
}
export function getGlobalAgentsPath() {
    return path.join(getCdxHome(), "AGENTS.md");
}
export function getConfigPath() {
    return getCdxConfigPath();
}
export function getUsageScratchDir() {
    return path.join(os.tmpdir(), "cdx-usage");
}
export function getRemoteDataDir() {
    return path.join(getCdxHome(), "remote");
}
export function getRemoteDevicesPath() {
    return path.join(getRemoteDataDir(), "trusted-devices.json");
}
