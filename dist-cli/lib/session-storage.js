import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getSessionMode, loadConfig } from "./config.js";
import { getGlobalSessionsPath } from "./paths.js";
import { listAllProfilesIncludingDuplicates } from "./profiles.js";
export async function ensureSessionStorageForProfile(profile) {
    const loaded = await loadConfig();
    await ensureSessionStorageLayout({
        profileId: profile.id,
        profileHomePath: profile.homePath,
        globalSessionsPath: getGlobalSessionsPath(),
        mode: getSessionMode(loaded.config),
    });
}
export async function ensureSessionStorageForAllProfiles() {
    const loaded = await loadConfig();
    const mode = getSessionMode(loaded.config);
    const globalSessionsPath = getGlobalSessionsPath();
    const profiles = await listAllProfilesIncludingDuplicates();
    await ensureSessionStorageLayouts(profiles.map((profile) => ({
        profileId: profile.id,
        profileHomePath: profile.homePath,
        globalSessionsPath,
        mode,
    })));
}
export async function ensureSessionStorageLayouts(optionsList) {
    for (const options of optionsList) {
        await ensureSessionStorageLayout(options);
    }
}
export async function ensureSessionStorageLayout(options) {
    const sessionsPath = path.join(options.profileHomePath, "sessions");
    await fsp.mkdir(options.profileHomePath, { recursive: true });
    if (options.mode === "profile") {
        await ensureLocalSessionsDirectory(sessionsPath);
        return;
    }
    await fsp.mkdir(options.globalSessionsPath, { recursive: true });
    const current = await lstatSafe(sessionsPath);
    if (!current) {
        await fsp.symlink(options.globalSessionsPath, sessionsPath);
        return;
    }
    if (current.isSymbolicLink()) {
        const currentTarget = await fsp.readlink(sessionsPath);
        if (path.resolve(path.dirname(sessionsPath), currentTarget) === path.resolve(options.globalSessionsPath)) {
            return;
        }
        await fsp.rm(sessionsPath, { force: true });
        await fsp.symlink(options.globalSessionsPath, sessionsPath);
        return;
    }
    if (!current.isDirectory()) {
        throw new Error(`Expected ${sessionsPath} to be a directory or symlink.`);
    }
    await mergeIntoGlobalSessions(sessionsPath, options.globalSessionsPath, options.profileId);
    await fsp.rm(sessionsPath, { recursive: true, force: true });
    await fsp.symlink(options.globalSessionsPath, sessionsPath);
}
async function ensureLocalSessionsDirectory(sessionsPath) {
    const current = await lstatSafe(sessionsPath);
    if (!current) {
        await fsp.mkdir(sessionsPath, { recursive: true });
        return;
    }
    if (current.isDirectory()) {
        return;
    }
    if (current.isSymbolicLink()) {
        await fsp.rm(sessionsPath, { force: true });
        await fsp.mkdir(sessionsPath, { recursive: true });
        return;
    }
    throw new Error(`Expected ${sessionsPath} to be a directory or symlink.`);
}
async function mergeIntoGlobalSessions(sourceDir, targetDir, profileId) {
    const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            await fsp.mkdir(targetPath, { recursive: true });
            await mergeIntoGlobalSessions(sourcePath, targetPath, profileId);
            continue;
        }
        if (!entry.isFile() && !entry.isSymbolicLink()) {
            continue;
        }
        await moveWithConflictSuffix(sourcePath, targetPath, profileId);
    }
}
async function moveWithConflictSuffix(sourcePath, targetPath, profileId) {
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    if (!fs.existsSync(targetPath)) {
        await fsp.rename(sourcePath, targetPath);
        return;
    }
    const parsed = path.parse(targetPath);
    let nextPath = path.join(parsed.dir, `${parsed.name}.profile-${profileId}-migrated${parsed.ext}`);
    let duplicateIndex = 2;
    while (fs.existsSync(nextPath)) {
        nextPath = path.join(parsed.dir, `${parsed.name}.profile-${profileId}-migrated-${duplicateIndex}${parsed.ext}`);
        duplicateIndex += 1;
    }
    await fsp.rename(sourcePath, nextPath);
}
async function lstatSafe(targetPath) {
    try {
        return await fsp.lstat(targetPath);
    }
    catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}
