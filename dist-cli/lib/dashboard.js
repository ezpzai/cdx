import { getAgentsStatus } from "./agents.js";
import { ensureCodexBinary } from "./codex.js";
import { listProfiles } from "./profiles.js";
import { fetchCodexUsage } from "./usage.js";
export async function getDashboardPayload(cwd) {
    const profiles = await listProfiles();
    const profileRows = profiles.map((profile) => {
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
    const usage = await Promise.all(profiles.map(async (profile) => {
        try {
            const snapshot = await fetchCodexUsage(profile);
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
            };
        }
        catch (error) {
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
            };
        }
    }));
    const usageByProfile = new Map(usage.map((item) => [item.profileId, item]));
    const normalizedProfiles = profileRows.map((profile) => {
        const snapshot = usageByProfile.get(profile.id);
        if (!snapshot) {
            return profile;
        }
        if (snapshot.error) {
            return { ...profile, status: "warning" };
        }
        if ((snapshot.fiveHourLeft ?? 100) < 25 || (snapshot.weeklyLeft ?? 100) < 20) {
            return { ...profile, status: "warning" };
        }
        return profile;
    });
    const highestUsage = usage
        .filter((item) => item.error === null && typeof item.fiveHourUsed === "number")
        .sort((left, right) => (right.fiveHourUsed ?? 0) - (left.fiveHourUsed ?? 0))[0];
    const agents = await getAgentsStatus(cwd);
    const missingAuthCount = normalizedProfiles.filter((item) => item.status === "idle").length;
    const liveUsageCount = usage.filter((item) => item.error === null).length;
    const doctor = [
        {
            title: agents.globalExists ? "Global AGENTS is ready" : "Global AGENTS is missing",
            severity: agents.globalExists ? "good" : "todo",
            detail: agents.globalExists
                ? `${agents.globalPath} can be linked into repos automatically.`
                : `Create ${agents.globalPath} to share one AGENTS file across repos.`,
            command: "cdx agents edit --global",
        },
        {
            title: agents.projectState === "global-link"
                ? "Project is covered by the shared AGENTS link"
                : agents.projectState === "local-file"
                    ? "Project uses its own local AGENTS file"
                    : "Project AGENTS coverage needs attention",
            severity: agents.projectState === "global-link"
                ? "good"
                : agents.projectState === "local-file"
                    ? "warn"
                    : "todo",
            detail: agents.projectState === "global-link"
                ? `${agents.projectAgentsPath} points at the shared AGENTS source.`
                : agents.projectState === "local-file"
                    ? `${agents.projectAgentsPath} exists locally, so cdx leaves it alone.`
                    : `No managed AGENTS link is present in ${agents.projectRoot}.`,
            command: "cdx doctor",
        },
        {
            title: liveUsageCount === normalizedProfiles.length ? "Live usage is reachable" : "Some profiles need re-authentication",
            severity: liveUsageCount === normalizedProfiles.length ? "good" : "warn",
            detail: liveUsageCount === normalizedProfiles.length
                ? `Fetched OpenAI usage for all ${liveUsageCount} profiles.`
                : `Fetched ${liveUsageCount}/${normalizedProfiles.length} profiles. Open the affected account with cdx login.`,
            command: "cdx usage",
        },
    ];
    let codexBinaryState = "ok";
    try {
        ensureCodexBinary();
    }
    catch {
        codexBinaryState = "missing";
    }
    if (codexBinaryState !== "ok") {
        doctor.push({
            title: "Codex CLI is not available",
            severity: "todo",
            detail: "Install @openai/codex globally before using cdx run or cdx usage.",
            command: "npm install -g @openai/codex",
        });
    }
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
        doctor,
    };
}
