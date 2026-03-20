import type { ProfileRecord } from "./profiles.js";
import type { UsageSource } from "./usage.js";

const HEALTHY_THRESHOLD_PERCENT = 10;

export interface UsageDisplayRow {
  profile: string;
  source: ProfileRecord["source"];
  usageSource: UsageSource;
  homePath: string;
  account: string;
  plan: string | null;
  fiveHourLeft: number | null;
  fiveHourReset: string | null;
  weeklyLeft: number | null;
  weeklyReset: string | null;
  fetchedAt: string;
  error: string | null;
}

function toResetTimestamp(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function toResetDayTimestamp(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function quotaSortValue(value: number | null): number {
  return typeof value === "number" ? value : -1;
}

function hasHealthyQuota(row: UsageDisplayRow): boolean {
  return (
    typeof row.fiveHourLeft === "number" &&
    typeof row.weeklyLeft === "number" &&
    row.fiveHourLeft >= HEALTHY_THRESHOLD_PERCENT &&
    row.weeklyLeft >= HEALTHY_THRESHOLD_PERCENT
  );
}

function hasLowQuota(row: UsageDisplayRow): boolean {
  const lowFiveHour = typeof row.fiveHourLeft === "number" && row.fiveHourLeft <= HEALTHY_THRESHOLD_PERCENT;
  const lowWeekly = typeof row.weeklyLeft === "number" && row.weeklyLeft <= HEALTHY_THRESHOLD_PERCENT;
  return lowFiveHour || lowWeekly;
}

function getPriorityGroup(row: UsageDisplayRow): number {
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

export function sortUsageRowsByPriority(rows: UsageDisplayRow[]): UsageDisplayRow[] {
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
