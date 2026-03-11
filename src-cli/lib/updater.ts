import { spawn, spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUpdateCheckPath } from "./paths.js";
import { confirm } from "./terminal.js";

const PACKAGE_NAME = "@ezpzai/cdx";
const UPDATE_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const VIEW_TIMEOUT_MS = 2_500;

interface PackageMetadata {
  name: string;
  version: string;
}

interface UpdateCheckCache {
  checkedAt: string;
  latestVersion: string | null;
}

type StartupUpdateResult = "continue" | "updated";

function getBundledPackagePath(): string {
  return fileURLToPath(new URL("../../package.json", import.meta.url));
}

async function readBundledPackageMetadata(): Promise<PackageMetadata | null> {
  try {
    const raw = await fsp.readFile(getBundledPackagePath(), "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown };
    if (typeof parsed.version !== "string") {
      return null;
    }
    return {
      name: typeof parsed.name === "string" ? parsed.name : PACKAGE_NAME,
      version: parsed.version,
    };
  } catch {
    return null;
  }
}

function getWhichCommand(): string {
  return process.platform === "win32" ? "where" : "which";
}

function commandAvailable(name: string): boolean {
  const result = spawnSync(getWhichCommand(), [name], {
    encoding: "utf8",
    stdio: "ignore",
  });
  return result.status === 0;
}

function parseVersion(version: string): { core: number[]; prerelease: string[] } | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;

  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber - rightNumber;
  }

  if (leftNumber !== null) {
    return -1;
  }

  if (rightNumber !== null) {
    return 1;
  }

  return left.localeCompare(right);
}

function compareVersions(left: string, right: string): number {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);
  if (!parsedLeft || !parsedRight) {
    return left.localeCompare(right, undefined, { numeric: true });
  }

  for (let index = 0; index < parsedLeft.core.length; index += 1) {
    const diff = parsedLeft.core[index] - parsedRight.core[index];
    if (diff !== 0) {
      return diff;
    }
  }

  if (parsedLeft.prerelease.length === 0 && parsedRight.prerelease.length === 0) {
    return 0;
  }

  if (parsedLeft.prerelease.length === 0) {
    return 1;
  }

  if (parsedRight.prerelease.length === 0) {
    return -1;
  }

  const length = Math.max(parsedLeft.prerelease.length, parsedRight.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = parsedLeft.prerelease[index];
    const rightIdentifier = parsedRight.prerelease[index];
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }

    const diff = compareIdentifiers(leftIdentifier, rightIdentifier);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

async function readUpdateCache(): Promise<UpdateCheckCache | null> {
  try {
    const raw = await fsp.readFile(getUpdateCheckPath(), "utf8");
    const parsed = JSON.parse(raw) as { checkedAt?: unknown; latestVersion?: unknown };
    if (typeof parsed.checkedAt !== "string") {
      return null;
    }
    return {
      checkedAt: parsed.checkedAt,
      latestVersion: typeof parsed.latestVersion === "string" ? parsed.latestVersion : null,
    };
  } catch {
    return null;
  }
}

async function writeUpdateCache(cache: UpdateCheckCache): Promise<void> {
  const cachePath = getUpdateCheckPath();
  await fsp.mkdir(path.dirname(cachePath), { recursive: true });
  await fsp.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function isFreshCache(cache: UpdateCheckCache | null): cache is UpdateCheckCache {
  if (!cache) {
    return false;
  }
  const checkedAt = Date.parse(cache.checkedAt);
  if (Number.isNaN(checkedAt)) {
    return false;
  }
  return Date.now() - checkedAt < UPDATE_CHECK_INTERVAL_MS;
}

function parseLatestVersion(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return trimmed;
  }
}

async function fetchLatestPublishedVersion(packageName: string): Promise<string | null> {
  if (!commandAvailable("npm")) {
    return null;
  }

  return await new Promise<string | null>((resolve) => {
    const child = spawn("npm", ["view", packageName, "version", "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(null);
    }, VIEW_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(parseLatestVersion(stdout));
    });
  });
}

async function resolveLatestVersion(packageName: string): Promise<string | null> {
  const cached = await readUpdateCache();
  if (isFreshCache(cached)) {
    return cached.latestVersion;
  }

  const latestVersion = await fetchLatestPublishedVersion(packageName);
  await writeUpdateCache({
    checkedAt: new Date().toISOString(),
    latestVersion,
  });
  return latestVersion;
}

async function runGlobalUpdate(packageName: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn("npm", ["install", "-g", packageName], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export async function maybeRunStartupUpdate(): Promise<StartupUpdateResult> {
  if (process.env.CDX_NO_UPDATE_CHECK === "1") {
    return "continue";
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return "continue";
  }

  const metadata = await readBundledPackageMetadata();
  if (!metadata) {
    return "continue";
  }

  const latestVersion = await resolveLatestVersion(metadata.name);
  if (!latestVersion || compareVersions(latestVersion, metadata.version) <= 0) {
    return "continue";
  }

  console.log("");
  console.log(`Update available for cdx: ${metadata.version} -> ${latestVersion}`);

  const shouldInstall = await confirm(`Install now via \`npm install -g ${metadata.name}\`?`, {
    defaultValue: true,
  });
  if (!shouldInstall) {
    console.log(`Run \`npm install -g ${metadata.name}\` whenever you're ready.`);
    console.log("");
    return "continue";
  }

  console.log("");
  console.log(`Updating cdx via \`npm install -g ${metadata.name}\`...`);
  console.log("");

  try {
    const exitCode = await runGlobalUpdate(metadata.name);
    if (exitCode === 0) {
      await writeUpdateCache({
        checkedAt: new Date().toISOString(),
        latestVersion,
      });
      console.log("");
      console.log("🎉 Update ran successfully! Please restart cdx.");
      return "updated";
    }
  } catch {
    // Fall through to the manual recovery hint below.
  }

  console.log("");
  console.log(`cdx: update failed. Try \`npm install -g ${metadata.name}\` manually.`);
  return "continue";
}
