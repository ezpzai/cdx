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
import { fetchCodexUsage } from "./lib/usage.js";
import { listTrustedDevices, revokeAllTrustedDevices, revokeTrustedDevice } from "./lib/remote-devices.js";
import { startRemoteSession } from "./lib/remote.js";
import { formatCloudflaredInstallHelp, isCloudflaredMissingError } from "./lib/remote-tunnel.js";
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
  console.log(`cdx

Usage:
  cdx run [profile] [codex args...] [--mode <safe|balanced|yolo>]
  cdx remote [profile] [codex args...] [--mode <safe|balanced|yolo>] [--tunnel <cloudflare|none>] [--no-qr] [--lan]
  cdx remote devices ls
  cdx remote devices rm <device-id>|--all
  cdx mode
  cdx mode set <safe|balanced|yolo> [--profile <profile>]
  cdx usage [profile] [--json]
  cdx agents edit --global
  cdx agents status
  cdx login <profile>
  cdx logout <profile>
  cdx ls
  cdx rm <profile> [--force]
`);
}

function printConfigWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.warn(`cdx: warning: ${warning}`);
  }
}

function formatQuotaValue(value: number | null, resetAt: string | null): string {
  if (value === null) {
    return "unknown";
  }
  return `${value}% left${resetAt ? ` (resets ${formatResetTime(resetAt)})` : ""}`;
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

function printPreflight(preflight: ReturnType<typeof buildPreflight>): void {
  console.log("\ncdx run preflight\n");
  console.log(`Profile:    ${preflight.profile.id}`);
  console.log(`Account:    ${preflight.profile.email}`);
  console.log(`Plan:       ${preflight.profile.plan}`);
  console.log(`Mode:       ${preflight.mode}`);
  console.log(`Auth:       ${preflight.authState}`);
  console.log(`5h quota:   ${formatQuotaValue(preflight.quota.fiveHourLeft, preflight.quota.fiveHourReset)}`);
  console.log(`Weekly:     ${formatQuotaValue(preflight.quota.weeklyLeft, preflight.quota.weeklyReset)}`);
}

async function chooseProfileInteractively(): Promise<ProfileRecord> {
  const profiles = await listProfiles();
  if (profiles.length === 0) {
    throw new Error(
      `No profiles found. Start one with \`cdx login <name>\` or move existing homes into ${getProfilesRoot()}.`,
    );
  }

  const usageRows = await loadUsageRows(profiles);
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
  const identity = `${profile.auth?.email || "not logged in"}${profile.auth?.plan ? ` (${profile.auth.plan})` : ""}`;
  if (!row?.usage) {
    return `${identity} - ?% 5h / ?% weekly`;
  }

  const fiveHour = row.usage.fiveHour?.remainingPercent ?? "?";
  const weekly = row.usage.weekly?.remainingPercent ?? "?";
  return `${identity} - ${fiveHour}% 5h / ${weekly}% weekly`;
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
          usage: await fetchCodexUsage(profile),
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

  const profiles = await listProfiles();
  const usageRows = await loadUsageRows(profiles);
  const currentRow = usageRows.find((row) => row.profile.id === profile.id);
  if (!currentRow) {
    throw new Error(`Failed to prepare usage row for ${profile.id}`);
  }

  let activeProfile = profile;
  let activeConfig = loadedConfig.config;
  let activeMode = await resolveMode(activeConfig, activeProfile.id, invocation.explicitMode);
  let candidates = rankCandidateProfiles(activeProfile.id, usageRows, getLowQuotaPreferredProfiles(activeConfig));
  let preflight = buildPreflight(activeProfile, activeMode, currentRow, candidates);

  printPreflight(preflight);

  let switchedBeforeRun = false;
  if (preflight.quota.warning) {
    const alternate = await maybeSwitchForLowQuota(preflight.candidates);
    if (alternate) {
      activeProfile = alternate.profile;
      activeMode = await resolveMode(activeConfig, activeProfile.id, invocation.explicitMode);
      const nextRow = usageRows.find((row) => row.profile.id === activeProfile.id);
      if (!nextRow) {
        throw new Error(`Failed to prepare usage row for ${activeProfile.id}`);
      }
      candidates = rankCandidateProfiles(activeProfile.id, usageRows, getLowQuotaPreferredProfiles(activeConfig));
      preflight = buildPreflight(activeProfile, activeMode, nextRow, candidates);
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

  const profiles = await listProfiles();
  const usageRows = await loadUsageRows(profiles);
  const currentRow = usageRows.find((row) => row.profile.id === profile.id);
  if (!currentRow) {
    throw new Error(`Failed to prepare usage row for ${profile.id}`);
  }

  let activeProfile = profile;
  let activeMode = await resolveMode(loadedConfig.config, activeProfile.id, invocation.explicitMode);
  let candidates = rankCandidateProfiles(activeProfile.id, usageRows, getLowQuotaPreferredProfiles(loadedConfig.config));
  let preflight = buildPreflight(activeProfile, activeMode, currentRow, candidates);

  printPreflight(preflight);

  let switchedBeforeRun = false;
  if (preflight.quota.warning) {
    const alternate = await maybeSwitchForLowQuota(preflight.candidates);
    if (alternate) {
      activeProfile = alternate.profile;
      activeMode = await resolveMode(loadedConfig.config, activeProfile.id, invocation.explicitMode);
      const nextRow = usageRows.find((row) => row.profile.id === activeProfile.id);
      if (!nextRow) {
        throw new Error(`Failed to prepare usage row for ${activeProfile.id}`);
      }
      candidates = rankCandidateProfiles(activeProfile.id, usageRows, getLowQuotaPreferredProfiles(loadedConfig.config));
      preflight = buildPreflight(activeProfile, activeMode, nextRow, candidates);
      printPreflight(preflight);
      switchedBeforeRun = true;
    }
  }

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

  if (switchedBeforeRun && activeProfile.id !== profile.id) {
    await maybeRememberLowQuotaPreference(activeProfile.id);
  }
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
    console.log("cdx mode\n");
    console.log(`Global default:  ${config.defaultMode ?? "unset"}`);
    const profileEntries = Object.entries(config.profiles);
    if (profileEntries.length === 0) {
      console.log("Profile defaults: none");
      return;
    }
    console.log("Profile defaults:");
    for (const [profileName, profileConfig] of profileEntries.sort(([left], [right]) => left.localeCompare(right))) {
      console.log(`  - ${profileName}: ${profileConfig.defaultMode ?? "unset"}`);
    }
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

  const rows = await Promise.all(
    profiles.map(async (profile) => {
      try {
        const snapshot = await fetchCodexUsage(profile);
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

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log("Profile          Account                                   Plan      5h left                      Weekly left");
  for (const row of rows) {
    const account = String(row.account).slice(0, 38).padEnd(38);
    const plan = String(row.plan || "unknown").slice(0, 8).padEnd(8);
    if (row.error) {
      console.log(`${row.profile.padEnd(16)} ${account} ${plan}  ${row.error}`);
      continue;
    }
    const fiveHour =
      row.fiveHourLeft === null
        ? "n/a".padEnd(28)
        : `${String(row.fiveHourLeft).padStart(3)}% left (${formatResetTime(row.fiveHourReset)})`.padEnd(28);
    const weekly =
      row.weeklyLeft === null
        ? "n/a"
        : `${String(row.weeklyLeft).padStart(3)}% left (${formatResetTime(row.weeklyReset)})`;
    console.log(`${row.profile.padEnd(16)} ${account} ${plan}  ${fiveHour} ${weekly}`);
  }
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
    const status = await getAgentsStatus(process.cwd());
    console.log(`Global:   ${status.globalExists ? status.globalPath : `${status.globalPath} (missing)`}`);
    console.log(`Project:  ${status.projectRoot}`);
    console.log(`AGENTS:   ${status.projectAgentsPath}`);
    console.log(`State:    ${status.projectState}`);
    if (status.linkedTarget) {
      console.log(`Target:   ${status.linkedTarget}`);
    }
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

  console.log("Profiles:\n");
  for (const profile of profiles) {
    const account = profile.auth?.email || "not logged in";
    const plan = profile.auth?.plan || "unknown";
    console.log(`- ${profile.id}  ${account}  [${profile.source}]  plan=${plan}  home=${profile.homePath}`);
  }
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
