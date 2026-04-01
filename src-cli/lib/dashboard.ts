import { getAgentsStatus } from "./agents.js";
import { mapConcurrent } from "./async.js";
import { listProfiles } from "./profiles.js";
import { fetchCodexUsage } from "./usage.js";

export interface DashboardProfile {
  id: string;
  account: string;
  plan: string | null;
  source: "modern" | "legacy";
  homePath: string;
  organization: string | null;
  accountId: string | null;
  lastRefresh: string | null;
  status: "healthy" | "warning" | "idle";
}

export interface DashboardUsageRow {
  profileId: string;
  account: string;
  plan: string | null;
  usageSource: "backend-api" | "status-scrape";
  fiveHourUsed: number | null;
  fiveHourLeft: number | null;
  fiveHourReset: string | null;
  weeklyUsed: number | null;
  weeklyLeft: number | null;
  weeklyReset: string | null;
  error: string | null;
}

export interface DashboardPayload {
  generatedAt: string;
  summary: {
    profileCount: number;
    connectedCount: number;
    liveUsageCount: number;
    missingAuthCount: number;
    highestUsageProfile: string | null;
  };
  profiles: DashboardProfile[];
  usage: DashboardUsageRow[];
  agents: Awaited<ReturnType<typeof getAgentsStatus>>;
}

export async function getDashboardPayload(cwd: string): Promise<DashboardPayload> {
  const profiles = await listProfiles();

  const profileRows: DashboardProfile[] = profiles.map((profile) => {
    const hasAuth = Boolean(profile.auth?.accessToken && profile.auth?.accountId);
    return {
      id: profile.id,
      account: profile.auth?.email || "not logged in",
      plan: profile.auth?.plan || null,
      source: profile.source,
      homePath: profile.homePath,
      organization: profile.auth?.organization || null,
      accountId: profile.auth?.accountId || null,
      lastRefresh: profile.auth?.lastRefresh || null,
      status: !hasAuth ? "idle" : "healthy",
    };
  });

  const usage = await mapConcurrent(profiles, async (profile) => {
      try {
        const snapshot = await fetchCodexUsage(profile, {
          allowStatusFallback: false,
          timeoutMs: 5_000,
        });
        return {
          profileId: snapshot.profile,
          account: snapshot.account,
          plan: snapshot.plan,
          usageSource: snapshot.usageSource,
          fiveHourUsed: snapshot.fiveHour?.usedPercent ?? null,
          fiveHourLeft: snapshot.fiveHour?.remainingPercent ?? null,
          fiveHourReset: snapshot.fiveHour?.resetAt ?? null,
          weeklyUsed: snapshot.weekly?.usedPercent ?? null,
          weeklyLeft: snapshot.weekly?.remainingPercent ?? null,
          weeklyReset: snapshot.weekly?.resetAt ?? null,
          error: null,
        } satisfies DashboardUsageRow;
      } catch (error) {
        return {
          profileId: profile.id,
          account: profile.auth?.email || "unknown",
          plan: profile.auth?.plan || null,
          usageSource: "backend-api",
          fiveHourUsed: null,
          fiveHourLeft: null,
          fiveHourReset: null,
          weeklyUsed: null,
          weeklyLeft: null,
          weeklyReset: null,
          error: error instanceof Error ? error.message : "Unknown error",
        } satisfies DashboardUsageRow;
      }
    });

  const usageByProfile = new Map(usage.map((item) => [item.profileId, item]));
  const normalizedProfiles = profileRows.map((profile) => {
    const snapshot = usageByProfile.get(profile.id);
    if (!snapshot) {
      return profile;
    }
    if (snapshot.error) {
      return { ...profile, status: "warning" as const };
    }
    if ((snapshot.fiveHourLeft ?? 100) < 25 || (snapshot.weeklyLeft ?? 100) < 20) {
      return { ...profile, status: "warning" as const };
    }
    return profile;
  });

  const highestUsage = usage
    .filter((item) => item.error === null && typeof item.fiveHourUsed === "number")
    .sort((left, right) => (right.fiveHourUsed ?? 0) - (left.fiveHourUsed ?? 0))[0];

  const agents = await getAgentsStatus(cwd);

  const missingAuthCount = normalizedProfiles.filter((item) => item.status === "idle").length;
  const liveUsageCount = usage.filter((item) => item.error === null).length;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      profileCount: normalizedProfiles.length,
      connectedCount: normalizedProfiles.filter((item) => item.status !== "idle").length,
      liveUsageCount,
      missingAuthCount,
      highestUsageProfile: highestUsage?.profileId ?? null,
    },
    profiles: normalizedProfiles,
    usage,
    agents,
  };
}
