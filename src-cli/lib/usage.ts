import { fetchCodexStatus } from "./codex.js";
import type { ProfileRecord } from "./profiles.js";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_USAGE_TIMEOUT_MS = 12_000;
const USER_AGENT = "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal";

interface UsageWindowShape {
  used_percent?: number;
  usedPercent?: number;
  reset_after_seconds?: number | null;
  resetAfterSeconds?: number | null;
}

interface UsageRateLimitShape {
  primary_window?: UsageWindowShape;
  primaryWindow?: UsageWindowShape;
  secondary_window?: UsageWindowShape;
  secondaryWindow?: UsageWindowShape;
}

interface UsageResponseShape {
  email?: string;
  plan_type?: string;
  planType?: string;
  rate_limit?: UsageRateLimitShape;
  rateLimit?: UsageRateLimitShape;
}

export interface UsageWindow {
  usedPercent: number;
  remainingPercent: number;
  resetAfterSeconds: number | null;
  resetAt: string | null;
}

export type UsageSource = "backend-api" | "status-scrape";

export interface UsageSnapshot {
  profile: string;
  source: ProfileRecord["source"];
  usageSource: UsageSource;
  homePath: string;
  account: string;
  plan: string | null;
  fiveHour: UsageWindow | null;
  weekly: UsageWindow | null;
  fetchedAt: string;
}

function normalizeWindow(input: UsageWindowShape | undefined): UsageWindow | null {
  if (!input) {
    return null;
  }

  const rawUsedPercent = input.used_percent ?? input.usedPercent ?? 0;
  const usedPercent = Math.max(0, Math.min(100, rawUsedPercent));
  const resetAfterSeconds = input.reset_after_seconds ?? input.resetAfterSeconds ?? null;
  const resetAt =
    typeof resetAfterSeconds === "number" && isFinite(resetAfterSeconds) && resetAfterSeconds > 0
      ? new Date(Date.now() + resetAfterSeconds * 1000).toISOString()
      : null;

  return {
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    resetAfterSeconds,
    resetAt,
  };
}

function formatResponseWindow(rateLimit: UsageRateLimitShape | undefined): {
  fiveHour: UsageWindow | null;
  weekly: UsageWindow | null;
} {
  const fiveHour = normalizeWindow(rateLimit?.primary_window || rateLimit?.primaryWindow);
  const weekly = normalizeWindow(rateLimit?.secondary_window || rateLimit?.secondaryWindow);
  return { fiveHour, weekly };
}

function toUsageSnapshotFromStatus(profile: ProfileRecord, status: Awaited<ReturnType<typeof fetchCodexStatus>>): UsageSnapshot {
  return {
    profile: profile.id,
    source: profile.source,
    usageSource: "status-scrape",
    homePath: profile.homePath,
    account: status.account || profile.auth?.email || "unknown",
    plan: profile.auth?.plan || null,
    fiveHour:
      typeof status.fiveHourLeft === "number"
        ? {
            usedPercent: Math.max(0, 100 - status.fiveHourLeft),
            remainingPercent: status.fiveHourLeft,
            resetAfterSeconds: null,
            resetAt: status.fiveHourReset,
          }
        : null,
    weekly:
      typeof status.weeklyLeft === "number"
        ? {
            usedPercent: Math.max(0, 100 - status.weeklyLeft),
            remainingPercent: status.weeklyLeft,
            resetAfterSeconds: null,
            resetAt: status.weeklyReset,
          }
        : null,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchBackendUsage(profile: ProfileRecord): Promise<UsageSnapshot> {
  const accessToken = profile.auth?.accessToken;
  const accountId = profile.auth?.accountId;

  if (!accessToken || !accountId) {
    throw new Error(`Profile ${profile.id} is missing auth tokens. Run \`cdx login ${profile.id}\`.`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CODEX_USAGE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(CODEX_USAGE_URL, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "ChatGPT-Account-Id": accountId,
        "User-Agent": USER_AGENT,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Profile ${profile.id} usage request timed out.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    throw new Error(`Profile ${profile.id} token expired. Re-login with \`cdx login ${profile.id}\`.`);
  }

  if (!response.ok) {
    throw new Error(`Profile ${profile.id} usage request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as UsageResponseShape;
  const windows = formatResponseWindow(payload.rate_limit || payload.rateLimit);

  return {
    profile: profile.id,
    source: profile.source,
    usageSource: "backend-api",
    homePath: profile.homePath,
    account: payload.email || profile.auth?.email || "unknown",
    plan: payload.plan_type || payload.planType || profile.auth?.plan || null,
    fiveHour: windows.fiveHour,
    weekly: windows.weekly,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchCodexUsage(profile: ProfileRecord): Promise<UsageSnapshot> {
  try {
    return await fetchBackendUsage(profile);
  } catch (backendError) {
    try {
      const status = await fetchCodexStatus(profile);
      return toUsageSnapshotFromStatus(profile, status);
    } catch {
      throw backendError;
    }
  }
}
