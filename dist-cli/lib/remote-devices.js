import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { getRemoteDevicesPath } from "./paths.js";
function createDefaultFile() {
    return {
        version: 1,
        devices: [],
    };
}
function hashSecret(secret) {
    return crypto.createHash("sha256").update(secret).digest("hex");
}
async function loadStore(filePath = getRemoteDevicesPath()) {
    try {
        const raw = await fsp.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const devices = Array.isArray(parsed.devices)
            ? parsed.devices
                .map((device) => normalizeDevice(device))
                .filter((device) => device !== null)
            : [];
        return {
            version: 1,
            devices,
        };
    }
    catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return createDefaultFile();
        }
        return createDefaultFile();
    }
}
async function saveStore(store, filePath = getRemoteDevicesPath()) {
    const directory = path.dirname(filePath);
    const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
    await fsp.mkdir(directory, { recursive: true });
    await fsp.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await fsp.rename(temporaryPath, filePath);
}
function normalizeDevice(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return null;
    }
    const device = input;
    if (typeof device.id !== "string" ||
        typeof device.label !== "string" ||
        typeof device.secretHash !== "string" ||
        typeof device.createdAt !== "string" ||
        typeof device.lastUsedAt !== "string") {
        return null;
    }
    return {
        id: device.id,
        label: device.label,
        secretHash: device.secretHash,
        createdAt: device.createdAt,
        lastUsedAt: device.lastUsedAt,
        revokedAt: typeof device.revokedAt === "string" ? device.revokedAt : null,
    };
}
export async function listTrustedDevices() {
    const store = await loadStore();
    return [...store.devices].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}
export async function issueTrustedDevice(label) {
    const store = await loadStore();
    const id = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString("base64url");
    const now = new Date().toISOString();
    const record = {
        id,
        label: label.trim() || "Remote device",
        secretHash: hashSecret(secret),
        createdAt: now,
        lastUsedAt: now,
        revokedAt: null,
    };
    store.devices.push(record);
    await saveStore(store);
    return {
        record,
        cookieValue: `${id}.${secret}`,
    };
}
export async function touchTrustedDevice(deviceId) {
    const store = await loadStore();
    const device = store.devices.find((candidate) => candidate.id === deviceId && candidate.revokedAt === null);
    if (!device) {
        return null;
    }
    device.lastUsedAt = new Date().toISOString();
    await saveStore(store);
    return device;
}
export async function resolveTrustedDevice(cookieValue) {
    if (!cookieValue) {
        return null;
    }
    const [deviceId, secret] = cookieValue.split(".");
    if (!deviceId || !secret) {
        return null;
    }
    const store = await loadStore();
    const device = store.devices.find((candidate) => candidate.id === deviceId && candidate.revokedAt === null);
    if (!device) {
        return null;
    }
    if (device.secretHash !== hashSecret(secret)) {
        return null;
    }
    device.lastUsedAt = new Date().toISOString();
    await saveStore(store);
    return device;
}
export async function revokeTrustedDevice(deviceId) {
    const store = await loadStore();
    const device = store.devices.find((candidate) => candidate.id === deviceId && candidate.revokedAt === null);
    if (!device) {
        return false;
    }
    device.revokedAt = new Date().toISOString();
    await saveStore(store);
    return true;
}
export async function revokeAllTrustedDevices() {
    const store = await loadStore();
    const activeDevices = store.devices.filter((device) => device.revokedAt === null);
    if (activeDevices.length === 0) {
        return 0;
    }
    const revokedAt = new Date().toISOString();
    for (const device of activeDevices) {
        device.revokedAt = revokedAt;
    }
    await saveStore(store);
    return activeDevices.length;
}
