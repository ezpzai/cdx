const HEALTHY_THRESHOLD_PERCENT = 10;
function toResetTimestamp(value) {
    if (!value) {
        return Number.POSITIVE_INFINITY;
    }
    const time = Date.parse(value);
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
function toResetDayTimestamp(value) {
    if (!value) {
        return Number.POSITIVE_INFINITY;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return Number.POSITIVE_INFINITY;
    }
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function quotaSortValue(value) {
    return typeof value === "number" ? value : -1;
}
function hasHealthyQuota(row) {
    return (typeof row.fiveHourLeft === "number" &&
        typeof row.weeklyLeft === "number" &&
        row.fiveHourLeft >= HEALTHY_THRESHOLD_PERCENT &&
        row.weeklyLeft >= HEALTHY_THRESHOLD_PERCENT);
}
function hasLowQuota(row) {
    const lowFiveHour = typeof row.fiveHourLeft === "number" && row.fiveHourLeft <= HEALTHY_THRESHOLD_PERCENT;
    const lowWeekly = typeof row.weeklyLeft === "number" && row.weeklyLeft <= HEALTHY_THRESHOLD_PERCENT;
    return lowFiveHour || lowWeekly;
}
function getPriorityGroup(row) {
    if (row.error) {
        return 2;
    }
    if (hasHealthyQuota(row)) {
        return 0;
    }
    if (hasLowQuota(row)) {
        return 1;
    }
    return 1;
}
export function sortUsageRowsByPriority(rows) {
    return [...rows].sort((left, right) => {
        const groupDiff = getPriorityGroup(left) - getPriorityGroup(right);
        if (groupDiff !== 0) {
            return groupDiff;
        }
        const weeklyResetDayDiff = toResetDayTimestamp(left.weeklyReset) - toResetDayTimestamp(right.weeklyReset);
        if (weeklyResetDayDiff !== 0) {
            return weeklyResetDayDiff;
        }
        const weeklyQuotaDiff = quotaSortValue(right.weeklyLeft) - quotaSortValue(left.weeklyLeft);
        if (weeklyQuotaDiff !== 0) {
            return weeklyQuotaDiff;
        }
        const fiveHourQuotaDiff = quotaSortValue(right.fiveHourLeft) - quotaSortValue(left.fiveHourLeft);
        if (fiveHourQuotaDiff !== 0) {
            return fiveHourQuotaDiff;
        }
        const weeklyResetTimeDiff = toResetTimestamp(left.weeklyReset) - toResetTimestamp(right.weeklyReset);
        if (weeklyResetTimeDiff !== 0) {
            return weeklyResetTimeDiff;
        }
        return left.profile.localeCompare(right.profile, undefined, { numeric: true });
    });
}
