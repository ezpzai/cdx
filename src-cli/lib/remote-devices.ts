import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { getRemoteDevicesPath } from "./paths.js";

interface RemoteDevicesFile {
  version: 1;
  devices: TrustedDeviceRecord[];
}

export interface TrustedDeviceRecord {
  id: string;
  label: string;
  secretHash: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
}

export interface TrustedDeviceGrant {
  record: TrustedDeviceRecord;
  cookieValue: string;
}

function createDefaultFile(): RemoteDevicesFile {
  return {
    version: 1,
    devices: [],
  };
}

function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

async function loadStore(filePath = getRemoteDevicesPath()): Promise<RemoteDevicesFile> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RemoteDevicesFile>;
    const devices = Array.isArray(parsed.devices)
      ? parsed.devices
          .map((device) => normalizeDevice(device))
          .filter((device): device is TrustedDeviceRecord => device !== null)
      : [];
    return {
      version: 1,
      devices,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return createDefaultFile();
    }
    return createDefaultFile();
  }
}

async function saveStore(store: RemoteDevicesFile, filePath = getRemoteDevicesPath()): Promise<void> {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);

  await fsp.mkdir(directory, { recursive: true });
  await fsp.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fsp.rename(temporaryPath, filePath);
}

function normalizeDevice(input: unknown): TrustedDeviceRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const device = input as Partial<TrustedDeviceRecord>;
  if (
    typeof device.id !== "string" ||
    typeof device.label !== "string" ||
    typeof device.secretHash !== "string" ||
    typeof device.createdAt !== "string" ||
    typeof device.lastUsedAt !== "string"
  ) {
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

export async function listTrustedDevices(): Promise<TrustedDeviceRecord[]> {
  const store = await loadStore();
  return [...store.devices].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}

export async function issueTrustedDevice(label: string): Promise<TrustedDeviceGrant> {
  const store = await loadStore();
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const record: TrustedDeviceRecord = {
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

export async function touchTrustedDevice(deviceId: string): Promise<TrustedDeviceRecord | null> {
  const store = await loadStore();
  const device = store.devices.find((candidate) => candidate.id === deviceId && candidate.revokedAt === null);
  if (!device) {
    return null;
  }

  device.lastUsedAt = new Date().toISOString();
  await saveStore(store);
  return device;
}

export async function resolveTrustedDevice(cookieValue: string | null | undefined): Promise<TrustedDeviceRecord | null> {
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

export async function revokeTrustedDevice(deviceId: string): Promise<boolean> {
  const store = await loadStore();
  const device = store.devices.find((candidate) => candidate.id === deviceId && candidate.revokedAt === null);
  if (!device) {
    return false;
  }

  device.revokedAt = new Date().toISOString();
  await saveStore(store);
  return true;
}

export async function revokeAllTrustedDevices(): Promise<number> {
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
