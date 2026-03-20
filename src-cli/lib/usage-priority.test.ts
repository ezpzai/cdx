import assert from "node:assert/strict";
import test from "node:test";
import { sortUsageRowsByPriority, type UsageDisplayRow } from "./usage-priority.js";

function createRow(overrides: Partial<UsageDisplayRow> & Pick<UsageDisplayRow, "profile">): UsageDisplayRow {
  return {
    profile: overrides.profile,
    source: overrides.source ?? "modern",
    usageSource: overrides.usageSource ?? "backend-api",
    homePath: overrides.homePath ?? `/tmp/${overrides.profile}`,
    account: overrides.account ?? `${overrides.profile}@example.com`,
    plan: overrides.plan ?? "team",
    fiveHourLeft: overrides.fiveHourLeft ?? 100,
    fiveHourReset: overrides.fiveHourReset ?? "2026-03-21T03:23:00+09:00",
    weeklyLeft: overrides.weeklyLeft ?? 100,
    weeklyReset: overrides.weeklyReset ?? "2026-03-27T22:23:00+09:00",
    fetchedAt: overrides.fetchedAt ?? "2026-03-20T10:00:00.000Z",
    error: overrides.error ?? null,
  };
}

test("1순위(정상) 안에서는 week 초기화 날짜가 가까운 순, 같은 날짜면 잔여량 높은 순으로 정렬한다", () => {
  const rows: UsageDisplayRow[] = [
    createRow({ profile: "cdx1", fiveHourLeft: 98, weeklyLeft: 11, weeklyReset: "2026-03-22T23:20:00+09:00" }),
    createRow({ profile: "codex6", weeklyLeft: 100, weeklyReset: "2026-03-26T15:04:00+09:00" }),
    createRow({ profile: "codex", weeklyLeft: 87, weeklyReset: "2026-03-23T16:46:00+09:00" }),
    createRow({
      profile: "codex5",
      fiveHourLeft: null,
      weeklyLeft: null,
      weeklyReset: null,
      error: "Profile codex5 token expired. Re-login with `cdx login codex5`.",
    }),
    createRow({ profile: "codex7", fiveHourLeft: 96, weeklyLeft: 14, weeklyReset: "2026-03-24T18:13:00+09:00" }),
    createRow({ profile: "codex3", weeklyLeft: 22, weeklyReset: "2026-03-23T13:12:00+09:00" }),
    createRow({ profile: "codex2", weeklyLeft: 100, weeklyReset: "2026-03-27T22:23:00+09:00" }),
    createRow({ profile: "codex4", weeklyLeft: 100, weeklyReset: "2026-03-27T22:23:00+09:00" }),
    createRow({ profile: "codex8", weeklyLeft: 87, weeklyReset: "2026-03-26T15:04:00+09:00" }),
  ];

  const sorted = sortUsageRowsByPriority(rows);
  assert.deepEqual(
    sorted.map((row) => row.profile),
    ["cdx1", "codex", "codex3", "codex7", "codex6", "codex8", "codex2", "codex4", "codex5"],
  );
});

test("2순위(10% 이하)는 1순위 뒤로 보내고 에러는 최하위로 보낸다", () => {
  const rows: UsageDisplayRow[] = [
    createRow({ profile: "healthy", fiveHourLeft: 72, weeklyLeft: 65, weeklyReset: "2026-03-25T12:00:00+09:00" }),
    createRow({ profile: "low-week", fiveHourLeft: 88, weeklyLeft: 9, weeklyReset: "2026-03-21T12:00:00+09:00" }),
    createRow({ profile: "low-5h", fiveHourLeft: 8, weeklyLeft: 90, weeklyReset: "2026-03-22T12:00:00+09:00" }),
    createRow({
      profile: "expired",
      fiveHourLeft: null,
      weeklyLeft: null,
      weeklyReset: null,
      error: "Profile expired token expired. Re-login with `cdx login expired`.",
    }),
  ];

  const sorted = sortUsageRowsByPriority(rows);
  assert.deepEqual(sorted.map((row) => row.profile), ["healthy", "low-week", "low-5h", "expired"]);
});
