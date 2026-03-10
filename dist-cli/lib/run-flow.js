const MODE_FLAGS = {
    safe: ["-s", "read-only", "-a", "untrusted"],
    balanced: ["--full-auto"],
    yolo: ["--dangerously-bypass-approvals-and-sandbox"],
};
const CONFLICT_FLAG_PREFIXES = [
    "-s",
    "--sandbox",
    "-a",
    "--ask-for-approval",
    "--full-auto",
    "--dangerously-bypass-approvals-and-sandbox",
];
function isConflictingArg(arg) {
    return CONFLICT_FLAG_PREFIXES.some((flag) => arg === flag || arg.startsWith(`${flag}=`));
}
function quotaScore(usage) {
    const values = [usage?.fiveHour?.remainingPercent ?? -1, usage?.weekly?.remainingPercent ?? -1];
    const knownValues = values.filter((value) => value >= 0);
    return knownValues.length === 0 ? -1 : Math.max(...knownValues);
}
function formatQuotaSummary(usage) {
    if (!usage) {
        return "unknown";
    }
    const fiveHour = usage.fiveHour ? `${usage.fiveHour.remainingPercent}% left` : "unknown";
    const weekly = usage.weekly ? `${usage.weekly.remainingPercent}% left` : "unknown";
    return `5h ${fiveHour}, weekly ${weekly}`;
}
export function getModeFlags(mode) {
    return [...MODE_FLAGS[mode]];
}
export function findConflictingCodexArgs(args) {
    return [...new Set(args.filter((arg) => isConflictingArg(arg)))];
}
export function resolveEffectiveMode(input) {
    return input.explicitMode ?? input.profileDefaultMode ?? input.globalDefaultMode ?? null;
}
export function isLowQuota(usage) {
    const fiveHourLeft = usage?.fiveHour?.remainingPercent ?? null;
    const weeklyLeft = usage?.weekly?.remainingPercent ?? null;
    if (fiveHourLeft === null && weeklyLeft === null) {
        return false;
    }
    return [fiveHourLeft, weeklyLeft].some((value) => value !== null && value <= 5);
}
export function getAuthState(profile, error = null) {
    if (!profile.auth?.accessToken || !profile.auth?.accountId) {
        return "missing";
    }
    const normalizedError = (error ?? "").toLowerCase();
    if (normalizedError.includes("expired") ||
        normalizedError.includes("401") ||
        normalizedError.includes("re-login") ||
        normalizedError.includes("usage request failed")) {
        return "stale-or-unknown";
    }
    return "ready";
}
export function rankCandidateProfiles(currentProfileId, rows, preferredProfileIds) {
    const preferenceOrder = new Map(preferredProfileIds.map((profileId, index) => [profileId, index]));
    return rows
        .filter((row) => row.profile.id !== currentProfileId)
        .map((row) => ({
        profile: row.profile,
        usage: row.usage,
        error: row.error,
        authState: getAuthState(row.profile, row.error),
        remainingQuotaScore: quotaScore(row.usage),
    }))
        .filter((row) => row.authState !== "missing")
        .sort((left, right) => {
        const leftPreference = preferenceOrder.get(left.profile.id) ?? Number.MAX_SAFE_INTEGER;
        const rightPreference = preferenceOrder.get(right.profile.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftPreference !== rightPreference) {
            return leftPreference - rightPreference;
        }
        if (left.remainingQuotaScore !== right.remainingQuotaScore) {
            return right.remainingQuotaScore - left.remainingQuotaScore;
        }
        return left.profile.id.localeCompare(right.profile.id);
    });
}
export function buildPreflight(profile, mode, current, candidates) {
    const usage = current.usage;
    return {
        profile: {
            id: profile.id,
            email: profile.auth?.email ?? "unknown",
            plan: usage?.plan ?? profile.auth?.plan ?? "unknown",
        },
        mode,
        quota: {
            fiveHourLeft: usage?.fiveHour?.remainingPercent ?? null,
            fiveHourReset: usage?.fiveHour?.resetAt ?? null,
            weeklyLeft: usage?.weekly?.remainingPercent ?? null,
            weeklyReset: usage?.weekly?.resetAt ?? null,
            warning: isLowQuota(usage),
            summary: current.error ? `unknown (${current.error})` : formatQuotaSummary(usage),
        },
        authState: getAuthState(profile, current.error),
        candidates,
    };
}
export function buildHandoffPrompt(previousProfileId, handoff) {
    return [
        "Continuity handoff",
        `Previous profile: ${previousProfileId}`,
        `Previous failure: ${handoff.failureReason ?? "unknown"}`,
        `Working directory: ${handoff.cwd ?? "unknown"}`,
        `Started at: ${handoff.startedAt ?? "unknown"}`,
        `Failed at: ${handoff.failedAt ?? "unknown"}`,
        "",
        "Recent work summary:",
        handoff.workSummary ?? "unknown",
        "",
        "Recent transcript excerpt:",
        handoff.transcriptExcerpt ?? "none",
        "",
        "Recent stdout/stderr summary:",
        [handoff.stdoutSummary, handoff.stderrSummary].filter(Boolean).join("\n") || "none",
        "",
        "Continue from this context.",
    ].join("\n");
}
function summarizeRunTask(args) {
    const promptArgs = args.filter((arg) => !arg.startsWith("-"));
    if (promptArgs.length === 0) {
        return null;
    }
    return promptArgs.join(" ").slice(0, 240);
}
export function buildRecentHandoffMetadata(input) {
    return {
        cwd: input.cwd,
        startedAt: input.startedAt,
        failedAt: input.failedAt,
        failureReason: input.failureReason,
        transcriptExcerpt: input.recentOutput.slice(-12).join("\n") || null,
        stdoutSummary: input.recentOutput.slice(-6).join("\n") || null,
        stderrSummary: null,
        workSummary: summarizeRunTask(input.args),
    };
}
export function shouldOfferContinuation(exitCode, recentOutput) {
    if (exitCode === 0) {
        return false;
    }
    const output = recentOutput.join("\n").toLowerCase();
    return (output.includes("quota") ||
        output.includes("limit") ||
        output.includes("rate limit") ||
        output.includes("auth") ||
        output.includes("expired") ||
        output.includes("login") ||
        output.includes("401"));
}
