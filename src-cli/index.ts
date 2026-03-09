#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ensureGlobalAgentsLink, getAgentsStatus } from "./lib/agents.js";
import { ensureCodexBinary, runCodex } from "./lib/codex.js";
import { getGlobalAgentsPath, getProfilesRoot } from "./lib/paths.js";
import { listProfiles, resolveProfile, type ProfileRecord } from "./lib/profiles.js";
import { prompt } from "./lib/terminal.js";
import { fetchCodexUsage } from "./lib/usage.js";
import {
  createProfile,
  getDoctorReport,
  prepareGlobalAgentsFile,
  startLoginSession,
  startLogoutSession,
} from "./lib/actions.js";

function printHelp(): void {
  console.log(`cdx

Usage:
  cdx run [profile] [codex args...]
  cdx usage [profile] [--json]
  cdx agents edit --global
  cdx agents status
  cdx login <profile>
  cdx logout <profile>
  cdx ls
  cdx whoami [profile]
  cdx create <profile>
  cdx rm <profile> [--force]
  cdx doctor
`);
}

function formatProfile(profile: ProfileRecord): string {
  const account = profile.auth?.email || "not logged in";
  const plan = profile.auth?.plan ? ` (${profile.auth.plan})` : "";
  return `${profile.id.padEnd(16)} ${account}${plan}`;
}

async function chooseProfileInteractively(): Promise<ProfileRecord> {
  const profiles = await listProfiles();
  if (profiles.length === 0) {
    throw new Error(
      `No profiles found. Create one with \`cdx create <name>\` or move existing homes into ${getProfilesRoot()}.`,
    );
  }

  console.log("Select a profile:\n");
  profiles.forEach((profile, index) => {
    console.log(`  ${index + 1}. ${formatProfile(profile)}`);
  });

  const answer = await prompt("\nChoose a number: ");
  const choice = Number(answer);
  if (!Number.isInteger(choice) || choice < 1 || choice > profiles.length) {
    throw new Error("Invalid selection.");
  }

  return profiles[choice - 1];
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

async function handleRun(args: string[]): Promise<void> {
  const [profileId, ...codexArgs] = args;
  const profile = await requireProfile(profileId);
  await ensureGlobalAgentsLink(process.cwd());
  const exitCode = await runCodex(profile, codexArgs, process.cwd());
  process.exitCode = exitCode;
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

  console.log("Profile           Source         Account                                   Plan      5h left                      Weekly left");
  for (const row of rows) {
    const source = row.usageSource.padEnd(13);
    const account = String(row.account).slice(0, 38).padEnd(38);
    const plan = String(row.plan || "unknown").slice(0, 8).padEnd(8);
    if (row.error) {
      console.log(`${row.profile.padEnd(16)} ${source} ${account} ${plan}  ${row.error}`);
      continue;
    }
    const fiveHour =
      row.fiveHourLeft === null
        ? "n/a".padEnd(28)
        : `${String(row.fiveHourLeft).padStart(3)}% left (${row.fiveHourReset ?? "?"})`.padEnd(28);
    const weekly =
      row.weeklyLeft === null ? "n/a" : `${String(row.weeklyLeft).padStart(3)}% left (${row.weeklyReset ?? "?"})`;
    console.log(`${row.profile.padEnd(16)} ${source} ${account} ${plan}  ${fiveHour} ${weekly}`);
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

async function handleWhoAmI(profileId: string | undefined): Promise<void> {
  const profile = await requireProfile(profileId);
  console.log(`Profile:       ${profile.id}`);
  console.log(`Home:          ${profile.homePath}`);
  console.log(`Source:        ${profile.source}`);
  console.log(`Email:         ${profile.auth?.email || "unknown"}`);
  console.log(`Plan:          ${profile.auth?.plan || "unknown"}`);
  console.log(`Organization:  ${profile.auth?.organization || "unknown"}`);
  console.log(`Last refresh:  ${profile.auth?.lastRefresh || "unknown"}`);
}

async function handleCreate(profileId: string | undefined): Promise<void> {
  if (!profileId) {
    throw new Error("Usage: cdx create <profile>");
  }
  const profile = await createProfile(profileId);
  console.log(`Created profile ${profile.id}`);
  console.log(`Home: ${profile.homePath}`);
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
  console.log(`Removed ${profile.id}`);
}

async function handleDoctor(): Promise<void> {
  const profiles = await listProfiles();
  const globalAgents = getGlobalAgentsPath();
  const agentsStatus = await getAgentsStatus(process.cwd());
  const report = await getDoctorReport(process.cwd());

  console.log("cdx doctor\n");
  console.log(`- codex binary:   ${(() => { try { ensureCodexBinary(); return "ok"; } catch { return "missing"; } })()}`);
  console.log(`- profiles found: ${profiles.length}`);
  console.log(`- global AGENTS:  ${fs.existsSync(globalAgents) ? globalAgents : "missing"}`);
  console.log(`- project AGENTS: ${agentsStatus.projectState} (${path.relative(process.cwd(), agentsStatus.projectAgentsPath) || "AGENTS.md"})`);
  console.log("");
  for (const item of report.doctor) {
    console.log(`- [${item.severity}] ${item.title}`);
    console.log(`  ${item.detail}`);
    console.log(`  command: ${item.command}`);
  }
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
    case "whoami":
      await handleWhoAmI(args[0]);
      return;
    case "create":
      await handleCreate(args[0]);
      return;
    case "rm":
      await handleRemove(args);
      return;
    case "doctor":
      await handleDoctor();
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
