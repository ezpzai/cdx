#!/usr/bin/env node

import fs from "node:fs";
import { spawn } from "node:child_process";
import { ensureGlobalAgentsLink, getAgentsStatus } from "./lib/agents.js";
import { runCodex } from "./lib/codex.js";
import {
  clearRecentHandoff,
  getGlobalDefaultMode,
  getLowQuotaPreferredProfiles,
  getProfileDefaultMode,
  loadConfig,
  rememberLowQuotaPreferredProfile,
  removeProfileState,
  RUN_MODES,
  saveConfig,
  setGlobalDefaultMode,
  setProfileDefaultMode,
  type CdxConfig,
  type RunMode,
} from "./lib/config.js";
import { getProfilesRoot } from "./lib/paths.js";
import { listProfiles, resolveProfile, type ProfileRecord } from "./lib/profiles.js";
import { confirm, prompt, selectMode, selectOne, type SelectOneOption } from "./lib/terminal.js";
import { fetchCodexUsage, fetchRemotePreflightUsage } from "./lib/usage.js";
import { listTrustedDevices, revokeAllTrustedDevices, revokeTrustedDevice } from "./lib/remote-devices.js";
import { startRemoteSession } from "./lib/remote.js";
import { formatCloudflaredInstallHelp, isCloudflaredMissingError } from "./lib/remote-tunnel.js";
import { sortUsageRowsByPriority, type UsageDisplayRow } from "./lib/usage-priority.js";
import {
  buildHandoffPrompt,
  buildPreflight,
  buildRecentHandoffMetadata,
  findConflictingCodexArgs,
  getModeFlags,
  rankCandidateProfiles,
  resolveEffectiveMode,
  shouldOfferContinuation,
  type CandidateProfile,
  type UsageLookupRow,
} from "./lib/run-flow.js";
import {
  prepareGlobalAgentsFile,
  startLoginSession,
  startLogoutSession,
} from "./lib/actions.js";

function printHelp(): void {
  const R = "\u001B[0m";
  const B = "\u001B[1m";
  const D = "\u001B[2m";
  const C = "\u001B[96m";
  const Y = "\u001B[93m";
  const W = "\u001B[97m";

  const lines = [
    "",
    `${B}${C} cdx${R}  ${D}Codex on mobile${R}`,
    "",
    `${W}Commands${R}`,
    `  ${C}run${R}     ${D}[profile] [--mode <mode>]${R}          Launch Codex`,
    `  ${C}remote${R}  ${D}[profile] [--tunnel <type>]${R}        Mobile remote session`,
    `  ${C}usage${R}   ${D}[profile] [--json]${R}                 Quota status`,
    `  ${C}mode${R}    ${D}[set <mode>] [--profile <p>]${R}       Default mode`,
    `  ${C}login${R}   ${D}<profile>${R}                           Create / login`,
    `  ${C}logout${R}  ${D}<profile>${R}                           Logout`,
    `  ${C}ls${R}                                         Profiles`,
    `  ${C}rm${R}      ${D}<profile> [--force]${R}                 Remove profile`,
    `  ${C}agents${R}  ${D}edit --global | status${R}              AGENTS.md`,
    "",
    `${W}Modes${R}  ${Y}safe${R} ${D}|${R} ${Y}balanced${R} ${D}|${R} ${Y}yolo${R}`,
    "",
  ];
  console.log(lines.join("\n"));
}

function printConfigWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(`cdx: warning: ${warning}`);
  }
}

function formatResetTime(value: string | null, fallback = "?"): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatResetUsageTime(value: string | null, fallback = "?"): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return formatResetTime(value, fallback);
  }

  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
  }).format(date);

  return `${formatResetTime(value, fallback)} on ${date.getDate()} ${month}`;
}

function getQuotaColor(value: number | null): string {
  if (value === null) {
    return "\u001B[2m";
  }

  if (value <= 20) {
    return "\u001B[91m";
  }

  if (value <= 50) {
    return "\u001B[93m";
  }

  return "\u001B[92m";
}

function formatColoredQuotaValue(value: number | null, resetAt: string | null): string {
  const R = "\u001B[0m";
  const D = "\u001B[2m";

  if (value === null) {
    return `${D}n/a${R}`;
  }

  return `${getQuotaColor(value)}${value}%${R} ${D}(${formatResetUsageTime(resetAt)})${R}`;
}

function printPreflight(preflight: ReturnType<typeof buildPreflight>): void {
  const R = "\u001B[0m";
  const D = "\u001B[2m";
  const C = "\u001B[96m";
  const Y = "\u001B[93m";
  const G = "\u001B[32m";
  const W = "\u001B[97m";

  const fiveH = formatColoredQuotaValue(preflight.quota.fiveHourLeft, preflight.quota.fiveHourReset);
  const weekly = formatColoredQuotaValue(preflight.quota.weeklyLeft, preflight.quota.weeklyReset);

  const lines = [
    "",
    `${D}──${R} ${C}cdx${R} ${D}preflight${R}`,
    `   ${D}profile${R}  ${W}${preflight.profile.id}${R}  ${D}${preflight.profile.email}${R}`,
    `   ${D}plan${R}     ${W}${preflight.profile.plan}${R}  ${D}mode=${R}${Y}${preflight.mode}${R}  ${D}auth=${R}${G}${preflight.authState}${R}`,
    `   ${D}5h${R}       ${W}${fiveH}${R}`,
    `   ${D}week${R}     ${W}${weekly}${R}`,
    "",
  ];
  console.log(lines.join("\n"));
}

async function chooseProfileInteractively(): Promise<ProfileRecord> {
  const profiles = await listProfiles();
  if (profiles.length === 0) {
    throw new Error(
      `No profiles found. Start one with \`cdx login <name>\` or move existing homes into ${getProfilesRoot()}.`,
    );
  }

  const usageRows = await Promise.all(
    profiles.map(async (profile) => ({
      profile,
      usage: await fetchRemotePreflightUsage(profile),
      error: null,
    }) satisfies UsageLookupRow),
  );
  const usageByProfileId = new Map(usageRows.map((row) => [row.profile.id, row] satisfies [string, UsageLookupRow]));

  return selectOne(
    "Select a profile:",
    profiles.map((profile) => ({
      value: profile,
      label: profile.id,
      detail: formatProfileSelectionDetail(profile, usageByProfileId.get(profile.id) ?? null),
      aliases: [profile.id],
    })),
  );
}

function formatProfileSelectionDetail(profile: ProfileRecord, row: UsageLookupRow | null): string {
  const R = "\u001B[0m";
  const identity = `${profile.auth?.email || "not logged in"}${profile.auth?.plan ? ` (${profile.auth.plan})` : ""}`;
  if (!row?.usage) {
    return `${identity} - ?% 5h / ?% weekly`;
  }

  const fiveHour = row.usage.fiveHour?.remainingPercent ?? "?";
  const weekly = row.usage.weekly?.remainingPercent ?? "?";
  const fiveHourLabel =
    typeof fiveHour === "number" ? `${getQuotaColor(fiveHour)}${fiveHour}%${R} 5h` : `${fiveHour}% 5h`;
  const weeklyLabel =
    typeof weekly === "number" ? `${getQuotaColor(weekly)}${weekly}%${R} weekly` : `${weekly}% weekly`;
  return `${identity} - ${fiveHourLabel} / ${weeklyLabel}`;
}

async function requireProfile(id: string | undefined): Promise<ProfileRecord> {
  if (!id) {
    return chooseProfileInteractively();
  }

  const profile = await resolveProfile(id);
  if (!profile) {
    throw new Error(`Unknown profile: ${id}`);
  }
  return profile;
}

function parseRunInvocation(args: string[]): { profileId?: string; explicitMode: RunMode | null; codexArgs: string[] } {
  const codexArgs: string[] = [];
  let explicitMode: RunMode | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mode") {
      const value = args[index + 1];
      if (!value || !RUN_MODES.includes(value as RunMode)) {
        throw new Error(`Invalid mode: ${value ?? ""}`);
      }
      explicitMode = value as RunMode;
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (!RUN_MODES.includes(value as RunMode)) {
        throw new Error(`Invalid mode: ${value}`);
      }
      explicitMode = value as RunMode;
      continue;
    }

    codexArgs.push(arg);
  }

  if (codexArgs[0] && !codexArgs[0].startsWith("-")) {
    return {
      profileId: codexArgs[0],
      explicitMode,
      codexArgs: codexArgs.slice(1),
    };
  }

  return {
    explicitMode,
    codexArgs,
  };
}

function parseRemoteInvocation(args: string[]): {
  profileId?: string;
  explicitMode: RunMode | null;
  codexArgs: string[];
  tunnel: "cloudflare" | "none";
  printQr: boolean;
  bindHost: string;
} {
  const codexArgs: string[] = [];
  let explicitMode: RunMode | null = null;
  let tunnel: "cloudflare" | "none" = "cloudflare";
  let printQr = true;
  let bindHost = "127.0.0.1";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mode") {
      const value = args[index + 1];
      if (!value || !RUN_MODES.includes(value as RunMode)) {
        throw new Error(`Invalid mode: ${value ?? ""}`);
      }
      explicitMode = value as RunMode;
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (!RUN_MODES.includes(value as RunMode)) {
        throw new Error(`Invalid mode: ${value}`);
      }
      explicitMode = value as RunMode;
      continue;
    }

    if (arg === "--tunnel") {
      const value = args[index + 1];
      if (value !== "cloudflare" && value !== "none") {
        throw new Error(`Invalid tunnel mode: ${value ?? ""}`);
      }
      tunnel = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--tunnel=")) {
      const value = arg.slice("--tunnel=".length);
      if (value !== "cloudflare" && value !== "none") {
        throw new Error(`Invalid tunnel mode: ${value}`);
      }
      tunnel = value;
      continue;
    }

    if (arg === "--no-qr") {
      printQr = false;
      continue;
    }

    if (arg === "--lan") {
      bindHost = "0.0.0.0";
      continue;
    }

    codexArgs.push(arg);
  }

  if (codexArgs[0] && !codexArgs[0].startsWith("-")) {
    return {
      profileId: codexArgs[0],
      explicitMode,
      codexArgs: codexArgs.slice(1),
      tunnel,
      printQr,
      bindHost,
    };
  }

  return {
    explicitMode,
    codexArgs,
    tunnel,
    printQr,
    bindHost,
  };
}

async function loadUsageRows(profiles: ProfileRecord[]): Promise<UsageLookupRow[]> {
  return Promise.all(
    profiles.map(async (profile) => {
      try {
        return {
          profile,
          usage: await fetchCodexUsage(profile, {
            allowStatusFallback: false,
            timeoutMs: 2_500,
          }),
          error: null,
        } satisfies UsageLookupRow;
      } catch (error) {
        return {
          profile,
          usage: null,
          error: error instanceof Error ? error.message : "Unknown error",
        } satisfies UsageLookupRow;
      }
    }),
  );
}

async function resolveMode(config: CdxConfig, profileId: string, explicitMode: RunMode | null): Promise<RunMode> {
  const resolvedMode = resolveEffectiveMode({
    explicitMode,
    profileDefaultMode: getProfileDefaultMode(config, profileId),
    globalDefaultMode: getGlobalDefaultMode(config),
  });

  if (resolvedMode) {
    return resolvedMode;
  }

  const selectedMode = await selectMode({
    question: "Select a default cdx mode:",
    prompt: "Choose a mode",
  });
  const updatedConfig = setGlobalDefaultMode(config, selectedMode);
  await saveConfig(updatedConfig);
  console.log(`Saved global default mode: ${selectedMode}`);
  return selectedMode;
}

async function pickAlternateProfile(candidates: CandidateProfile[], reason: string): Promise<CandidateProfile | null> {
  if (candidates.length === 0) {
    return null;
  }

  const options: SelectOneOption<CandidateProfile | null>[] = [
    { value: null, label: "continue", detail: "keep the current profile", aliases: ["c"] },
    ...candidates.map((candidate) => ({
      value: candidate,
      label: candidate.profile.id,
      detail:
        candidate.usage === null
          ? candidate.error || "quota unknown"
          : `${candidate.usage.fiveHour?.remainingPercent ?? "?"}% 5h, ${candidate.usage.weekly?.remainingPercent ?? "?"}% weekly`,
      aliases: [candidate.profile.id],
    })),
  ];

  return selectOne(`Select an alternate profile (${reason}):`, options, {
    defaultValue: null,
    prompt: "Choose a profile",
  });
}

async function maybeSwitchForLowQuota(candidates: CandidateProfile[]): Promise<CandidateProfile | null> {
  const action = await selectOne(
    "Low quota detected. Choose what to do:",
    [
      { value: "continue", label: "continue", detail: "run with the current profile", aliases: ["c"] },
      { value: "switch", label: "switch", detail: "pick another profile", aliases: ["s"] },
    ],
    { defaultValue: "continue", prompt: "Choose an action" },
  );

  if (action === "continue") {
    return null;
  }

  return pickAlternateProfile(candidates, "low quota warning");
}

function buildContinuationArgs(codexArgs: string[], handoffPrompt: string): string[] {
  return [...codexArgs, handoffPrompt];
}

function shouldCaptureRunOutput(codexArgs: string[]): boolean {
  const command = codexArgs[0] ?? null;
  return command === "exec" || command === "review";
}

async function maybeRememberLowQuotaPreference(profileId: string): Promise<void> {
  const shouldSave = await confirm(`Prefer ${profileId} first for future low-quota recommendations?`, {
    defaultValue: true,
  });
  if (!shouldSave) {
    return;
  }

  const loaded = await loadConfig();
  printConfigWarnings(loaded.warnings);
  const nextConfig = rememberLowQuotaPreferredProfile(loaded.config, profileId);
  await saveConfig(nextConfig);
}

async function runWithProfile(
  profile: ProfileRecord,
  mode: RunMode,
  codexArgs: string[],
  cwd: string,
  config: CdxConfig,
): Promise<{ exitCode: number; recentOutput: string[]; config: CdxConfig }> {
  await ensureGlobalAgentsLink(cwd);

  const startedAt = new Date().toISOString();
  const result = await runCodex(profile, [...getModeFlags(mode), ...codexArgs], cwd, {
    captureOutput: shouldCaptureRunOutput(codexArgs),
  });
  const failedAt = result.exitCode === 0 ? null : new Date().toISOString();
  const failureReason = result.exitCode === 0 ? null : result.recentOutput[result.recentOutput.length - 1] ?? "Run failed.";
  const nextConfig = clearRecentHandoff(
    setProfileDefaultMode(config, profile.id, getProfileDefaultMode(config, profile.id)),
    profile.id,
  );

  const withHandoff =
    result.exitCode === 0
      ? nextConfig
      : {
          ...nextConfig,
          recentHandoffs: {
            ...nextConfig.recentHandoffs,
            [profile.id]: buildRecentHandoffMetadata({
              profile,
              cwd,
              startedAt,
              failedAt,
              failureReason,
              recentOutput: result.recentOutput,
              args: codexArgs,
            }),
          },
        };

  await saveConfig(withHandoff);

  return {
    exitCode: result.exitCode,
    recentOutput: result.recentOutput,
    config: withHandoff,
  };
}

async function handleRun(args: string[]): Promise<void> {
  const invocation = parseRunInvocation(args);
  const profile = await requireProfile(invocation.profileId);
  const loadedConfig = await loadConfig();
  printConfigWarnings(loadedConfig.warnings);

  const conflictingFlags = findConflictingCodexArgs(invocation.codexArgs);
  if (conflictingFlags.length > 0) {
    throw new Error(`Conflicting Codex flags with cdx mode: ${conflictingFlags.join(", ")}`);
  }

  let activeProfile = profile;
  let activeConfig = loadedConfig.config;
  let activeMode = await resolveMode(activeConfig, activeProfile.id, invocation.explicitMode);
  let currentUsage = await fetchRemotePreflightUsage(activeProfile);
  let candidates: CandidateProfile[] = [];
  let preflight = buildPreflight(
    activeProfile,
    activeMode,
    {
      profile: activeProfile,
      usage: currentUsage,
      error: null,
    },
    candidates,
  );

  printPreflight(preflight);

  let switchedBeforeRun = false;
  if (preflight.quota.warning) {
    const profiles = await listProfiles();
    const usageRows = await loadUsageRows(profiles);
    candidates = rankCandidateProfiles(activeProfile.id, usageRows, getLowQuotaPreferredProfiles(activeConfig));
    preflight = buildPreflight(
      activeProfile,
      activeMode,
      {
        profile: activeProfile,
        usage: currentUsage,
        error: null,
      },
      candidates,
    );
    const alternate = await maybeSwitchForLowQuota(candidates);
    if (alternate) {
      activeProfile = alternate.profile;
      activeMode = await resolveMode(activeConfig, activeProfile.id, invocation.explicitMode);
      currentUsage = await fetchRemotePreflightUsage(activeProfile);
      preflight = buildPreflight(
        activeProfile,
        activeMode,
        {
          profile: activeProfile,
          usage: currentUsage,
          error: null,
        },
        candidates,
      );
      printPreflight(preflight);
      switchedBeforeRun = true;
    }
  }

  const firstRun = await runWithProfile(activeProfile, activeMode, invocation.codexArgs, process.cwd(), activeConfig);
  activeConfig = firstRun.config;

  if (switchedBeforeRun && activeProfile.id !== profile.id) {
    await maybeRememberLowQuotaPreference(activeProfile.id);
  }

  if (!shouldOfferContinuation(firstRun.exitCode, firstRun.recentOutput)) {
    process.exitCode = firstRun.exitCode;
    return;
  }

  if (candidates.length === 0) {
    const profiles = await listProfiles();
    const usageRows = await loadUsageRows(profiles);
    candidates = rankCandidateProfiles(activeProfile.id, usageRows, getLowQuotaPreferredProfiles(activeConfig));
  }

  const alternate = await pickAlternateProfile(candidates, "run failed");
  if (!alternate) {
    process.exitCode = firstRun.exitCode;
    return;
  }

  const handoff = activeConfig.recentHandoffs[activeProfile.id];
  const continuationMode = await resolveMode(activeConfig, alternate.profile.id, invocation.explicitMode);
  const continuationArgs = handoff
    ? buildContinuationArgs(invocation.codexArgs, buildHandoffPrompt(activeProfile.id, handoff))
    : invocation.codexArgs;

  const continuation = await runWithProfile(
    alternate.profile,
    continuationMode,
    continuationArgs,
    process.cwd(),
    activeConfig,
  );
  process.exitCode = continuation.exitCode;

  if (alternate.profile.id !== activeProfile.id) {
    await maybeRememberLowQuotaPreference(alternate.profile.id);
  }
}

async function handleRemote(args: string[]): Promise<void> {
  const invocation = parseRemoteInvocation(args);
  const profile = await requireProfile(invocation.profileId);
  const loadedConfig = await loadConfig();
  printConfigWarnings(loadedConfig.warnings);

  const conflictingFlags = findConflictingCodexArgs(invocation.codexArgs);
  if (conflictingFlags.length > 0) {
    throw new Error(`Conflicting Codex flags with cdx mode: ${conflictingFlags.join(", ")}`);
  }

  const activeProfile = profile;
  const activeMode = await resolveMode(loadedConfig.config, activeProfile.id, invocation.explicitMode);
  const usage = await fetchRemotePreflightUsage(activeProfile);
  printPreflight(
    buildPreflight(
      activeProfile,
      activeMode,
      {
        profile: activeProfile,
        usage,
        error: null,
      },
      [],
    ),
  );

  let result;
  try {
    result = await startRemoteSession({
      profile: activeProfile,
      mode: activeMode,
      codexArgs: invocation.codexArgs,
      cwd: process.cwd(),
      tunnel: invocation.tunnel,
      bindHost: invocation.bindHost,
      printQr: invocation.printQr,
    });
  } catch (error) {
    if (isCloudflaredMissingError(error)) {
      console.error(formatCloudflaredInstallHelp());
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  process.exitCode = result.exitCode;
}

async function handleRemoteDevices(args: string[]): Promise<void> {
  const [subcommand, target] = args;

  if (subcommand === "ls") {
    const devices = await listTrustedDevices();
    if (devices.length === 0) {
      console.log("No trusted remote devices.");
      return;
    }

    console.log("Trusted remote devices:\n");
    for (const device of devices) {
      const revoked = device.revokedAt ? ` revoked=${device.revokedAt}` : "";
      console.log(`- ${device.id}  ${device.label}  created=${device.createdAt}  lastUsed=${device.lastUsedAt}${revoked}`);
    }
    return;
  }

  if (subcommand === "rm") {
    if (!target) {
      throw new Error("Usage: cdx remote devices rm <device-id>|--all");
    }

    if (target === "--all") {
      const revokedCount = await revokeAllTrustedDevices();
      console.log(`Revoked ${revokedCount} trusted device${revokedCount === 1 ? "" : "s"}.`);
      return;
    }

    const revoked = await revokeTrustedDevice(target);
    if (!revoked) {
      throw new Error(`Unknown trusted device: ${target}`);
    }
    console.log(`Revoked ${target}`);
    return;
  }

  throw new Error("Usage: cdx remote devices ls | cdx remote devices rm <device-id>|--all");
}

async function handleMode(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;
  const loaded = await loadConfig();
  printConfigWarnings(loaded.warnings);
  let config = loaded.config;

  const profileFlagIndex = rest.indexOf("--profile");
  const profileId = profileFlagIndex >= 0 ? rest[profileFlagIndex + 1] : undefined;

  if (!subcommand) {
    const R = "\u001B[0m";
    const D = "\u001B[2m";
    const C = "\u001B[96m";
    const Y = "\u001B[93m";

    console.log("");
    console.log(`  ${D}global${R}  ${Y}${config.defaultMode ?? "unset"}${R}`);
    const profileEntries = Object.entries(config.profiles);
    if (profileEntries.length > 0) {
      for (const [profileName, profileConfig] of profileEntries.sort(([a], [b]) => a.localeCompare(b))) {
        console.log(`  ${C}${profileName}${R}  ${Y}${profileConfig.defaultMode ?? "unset"}${R}`);
      }
    }
    console.log("");
    return;
  }

  if (subcommand === "set") {
    const mode = rest[0];
    if (!RUN_MODES.includes(mode as RunMode)) {
      throw new Error(`Usage: cdx mode set <${RUN_MODES.join("|")}> [--profile <profile>]`);
    }
    if (profileId) {
      const profile = await resolveProfile(profileId);
      if (!profile) {
        throw new Error(`Unknown profile: ${profileId}`);
      }
      config = setProfileDefaultMode(config, profile.id, mode as RunMode);
      await saveConfig(config);
      console.log(`Set default mode for ${profile.id}: ${mode}`);
      return;
    }
    config = setGlobalDefaultMode(config, mode as RunMode);
    await saveConfig(config);
    console.log(`Set global default mode: ${mode}`);
    return;
  }

  throw new Error("Usage: cdx mode [set <safe|balanced|yolo> [--profile <profile>]]");
}

async function handleUsage(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const positional = args.filter((arg) => arg !== "--json");
  const [profileId] = positional;
  const profiles = profileId ? [await requireProfile(profileId)] : await listProfiles();

  const rows: UsageDisplayRow[] = await Promise.all(
    profiles.map(async (profile) => {
      try {
        const snapshot = await fetchCodexUsage(profile, {
          allowStatusFallback: false,
          timeoutMs: 2_500,
        });
        return {
          profile: snapshot.profile,
          source: snapshot.source,
          usageSource: snapshot.usageSource,
          homePath: snapshot.homePath,
          account: snapshot.account,
          plan: snapshot.plan,
          fiveHourLeft: snapshot.fiveHour?.remainingPercent ?? null,
          fiveHourReset: snapshot.fiveHour?.resetAt ?? null,
          weeklyLeft: snapshot.weekly?.remainingPercent ?? null,
          weeklyReset: snapshot.weekly?.resetAt ?? null,
          fetchedAt: snapshot.fetchedAt,
          error: null,
        };
      } catch (error) {
        return {
          profile: profile.id,
          source: profile.source,
          usageSource: "backend-api",
          homePath: profile.homePath,
          account: profile.auth?.email || "unknown",
          plan: profile.auth?.plan || null,
          fiveHourLeft: null,
          fiveHourReset: null,
          weeklyLeft: null,
          weeklyReset: null,
          fetchedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
  );
  const sortedRows = sortUsageRowsByPriority(rows);

  if (json) {
    console.log(JSON.stringify(sortedRows, null, 2));
    return;
  }

  console.log("");
  const R = "\u001B[0m";
  const D = "\u001B[2m";
  const C = "\u001B[96m";
  const W = "\u001B[97m";
  const RED = "\u001B[91m";

  for (const row of sortedRows) {
    const account = String(row.account).slice(0, 38);
    const plan = row.plan || "unknown";
    if (row.error) {
      console.log(`  ${C}${row.profile}${R}  ${D}${account}${R}  ${RED}${row.error}${R}`);
      continue;
    }
    const fiveHour = formatColoredQuotaValue(row.fiveHourLeft, row.fiveHourReset);
    const weekly = formatColoredQuotaValue(row.weeklyLeft, row.weeklyReset);
    console.log(
      `  ${C}${row.profile}${R}  ${D}${account}${R}  ${D}${plan}${R}  ${W}5h${R} ${fiveHour}  ${W}week${R} ${weekly}`,
    );
  }
  console.log("");
}

async function handleAgents(args: string[]): Promise<void> {
  const [subcommand, option] = args;

  if (subcommand === "edit" && option === "--global") {
    const { filePath } = await prepareGlobalAgentsFile(process.cwd());
    const editor = process.env.VISUAL || process.env.EDITOR || (process.platform === "darwin" ? "open -e" : "nano");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(editor, [filePath], {
        stdio: "inherit",
        shell: true,
      });
      child.on("error", reject);
      child.on("exit", () => resolve());
    });
    return;
  }

  if (subcommand === "status") {
    const R = "\u001B[0m";
    const D = "\u001B[2m";
    const C = "\u001B[96m";
    const W = "\u001B[97m";
    const status = await getAgentsStatus(process.cwd());
    console.log("");
    console.log(`  ${D}global${R}    ${W}${status.globalExists ? status.globalPath : `${status.globalPath} (missing)`}${R}`);
    console.log(`  ${D}project${R}   ${W}${status.projectRoot}${R}`);
    console.log(`  ${D}agents${R}    ${C}${status.projectAgentsPath}${R}`);
    console.log(`  ${D}state${R}     ${W}${status.projectState}${R}`);
    if (status.linkedTarget) {
      console.log(`  ${D}target${R}    ${W}${status.linkedTarget}${R}`);
    }
    console.log("");
    return;
  }

  throw new Error("Usage: cdx agents edit --global | cdx agents status");
}

async function handleLogin(profileId: string | undefined): Promise<void> {
  if (!profileId) {
    throw new Error("Usage: cdx login <profile>");
  }
  const session = await startLoginSession(profileId, process.cwd());
  process.exitCode = session.exitCode ?? (session.status === "succeeded" ? 0 : 1);
}

async function handleLogout(profileId: string | undefined): Promise<void> {
  if (!profileId) {
    throw new Error("Usage: cdx logout <profile>");
  }
  const session = await startLogoutSession(profileId, process.cwd());
  process.exitCode = session.exitCode ?? (session.status === "succeeded" ? 0 : 1);
}

async function handleList(): Promise<void> {
  const profiles = await listProfiles();
  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  const R = "\u001B[0m";
  const D = "\u001B[2m";
  const C = "\u001B[96m";
  const W = "\u001B[97m";

  console.log("");
  for (const profile of profiles) {
    const account = profile.auth?.email || "not logged in";
    const plan = profile.auth?.plan || "?";
    console.log(`  ${C}${profile.id}${R}  ${D}${account}${R}  ${W}${plan}${R}`);
  }
  console.log("");
}

async function handleRemove(args: string[]): Promise<void> {
  const [profileId, forceFlag] = args;
  if (!profileId) {
    throw new Error("Usage: cdx rm <profile> [--force]");
  }

  const profile = await resolveProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown profile: ${profileId}`);
  }
  if (profile.source !== "modern") {
    throw new Error("Legacy profiles are read-only. Remove them manually if needed.");
  }

  if (forceFlag !== "--force") {
    const answer = await prompt(`Delete ${profile.id} at ${profile.homePath}? Type "yes" to confirm: `);
    if (answer !== "yes") {
      console.log("Aborted.");
      return;
    }
  }

  await fs.promises.rm(profile.homePath, { recursive: true, force: true });
  const loaded = await loadConfig();
  printConfigWarnings(loaded.warnings);
  await saveConfig(removeProfileState(loaded.config, profile.id));
  console.log(`Removed ${profile.id}`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  switch (command) {
    case "run":
      await handleRun(args);
      return;
    case "remote":
      if (args[0] === "devices") {
        await handleRemoteDevices(args.slice(1));
        return;
      }
      await handleRemote(args);
      return;
    case "mode":
      await handleMode(args);
      return;
    case "usage":
      await handleUsage(args);
      return;
    case "agents":
      await handleAgents(args);
      return;
    case "login":
      await handleLogin(args[0]);
      return;
    case "logout":
      await handleLogout(args[0]);
      return;
    case "ls":
      await handleList();
      return;
    case "rm":
      await handleRemove(args);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`cdx: ${message}`);
  process.exitCode = 1;
});
