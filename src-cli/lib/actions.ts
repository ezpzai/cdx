import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { ensureGlobalAgentsFile, ensureGlobalAgentsLink, getAgentsStatus } from "./agents.js";
import { runCodexSubcommand, ensureCodexBinary, ensureTrustedCodexWorkspace } from "./codex.js";
import { getGlobalAgentsPath } from "./paths.js";
import { ensureModernProfile, listProfiles, resolveProfile, type ProfileRecord } from "./profiles.js";

export type ActionSessionType = "run" | "login" | "logout";
export type ActionSessionStatus = "pending" | "starting" | "running" | "succeeded" | "failed";

export interface ActionSession {
  id: string;
  type: ActionSessionType;
  profileId: string;
  status: ActionSessionStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  message: string;
  recentOutput: string[];
}

const actionSessions = new Map<string, ActionSession>();
const SESSION_OUTPUT_LIMIT = 40;

function trimOutput(lines: string[]): string[] {
  return lines.slice(-SESSION_OUTPUT_LIMIT);
}

function appendOutput(sessionId: string, chunk: string): void {
  const session = actionSessions.get(sessionId);
  if (!session) {
    return;
  }

  const nextLines = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (nextLines.length === 0) {
    return;
  }

  session.recentOutput = trimOutput([...session.recentOutput, ...nextLines]);
  session.message = session.recentOutput[session.recentOutput.length - 1] ?? session.message;
}

function updateSession(sessionId: string, patch: Partial<ActionSession>): ActionSession {
  const current = actionSessions.get(sessionId);
  if (!current) {
    throw new Error(`Unknown action session: ${sessionId}`);
  }

  const next = { ...current, ...patch } satisfies ActionSession;
  actionSessions.set(sessionId, next);
  return next;
}

function createSession(type: ActionSessionType, profileId: string, message: string): ActionSession {
  const session: ActionSession = {
    id: crypto.randomUUID(),
    type,
    profileId,
    status: "pending",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    message,
    recentOutput: [],
  };
  actionSessions.set(session.id, session);
  return session;
}

export function getActionSession(sessionId: string): ActionSession | null {
  return actionSessions.get(sessionId) ?? null;
}

export async function prepareGlobalAgentsFile(cwd: string): Promise<{
  filePath: string;
  status: Awaited<ReturnType<typeof getAgentsStatus>>;
}> {
  const filePath = await ensureGlobalAgentsFile();
  const status = await getAgentsStatus(cwd);
  return { filePath, status };
}

export async function listAvailableProfiles(): Promise<ProfileRecord[]> {
  return listProfiles();
}

export async function startRunSession(profileId: string, cwd: string, args: string[] = []): Promise<ActionSession> {
  const profile = await requireProfile(profileId);
  ensureCodexBinary();
  await ensureGlobalAgentsLink(cwd);
  await ensureTrustedCodexWorkspace(profile, cwd);
  const session = createSession("run", profile.id, `Starting Codex for ${profile.id}...`);
  updateSession(session.id, { status: "starting" });

  const child = spawn("codex", args, {
    cwd,
    env: {
      ...process.env,
      CODEX_HOME: profile.homePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer | string) => {
    appendOutput(session.id, chunk.toString());
    updateSession(session.id, { status: "running" });
  });

  child.stderr.on("data", (chunk: Buffer | string) => {
    appendOutput(session.id, chunk.toString());
    updateSession(session.id, { status: "running" });
  });

  child.on("error", (error) => {
    updateSession(session.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      exitCode: 1,
      message: error.message,
      recentOutput: trimOutput([...getActionSession(session.id)?.recentOutput ?? [], error.message]),
    });
  });

  child.on("exit", (code) => {
    const succeeded = (code ?? 0) === 0;
    const current = getActionSession(session.id);
    updateSession(session.id, {
      status: succeeded ? "succeeded" : "failed",
      finishedAt: new Date().toISOString(),
      exitCode: code ?? 0,
      message:
        current?.recentOutput[current.recentOutput.length - 1] ??
        (succeeded ? `Codex exited successfully for ${profile.id}.` : `Codex exited with code ${code ?? 0}.`),
    });
  });

  return getActionSession(session.id) ?? session;
}

export async function startLoginSession(profileId: string, cwd: string): Promise<ActionSession> {
  const existingProfile = await resolveProfile(profileId);
  const profile = existingProfile || (await ensureModernProfile(profileId));
  const initialMessage = existingProfile
    ? `Starting login for ${profile.id}...`
    : `Created profile ${profile.id}. Starting login...`;
  return startSubcommandSession("login", profile, cwd, ["login"], initialMessage);
}

export async function startLogoutSession(profileId: string, cwd: string): Promise<ActionSession> {
  const profile = await requireProfile(profileId);
  return startSubcommandSession("logout", profile, cwd, ["logout"], `Starting logout for ${profile.id}...`);
}

async function startSubcommandSession(
  type: "login" | "logout",
  profile: ProfileRecord,
  cwd: string,
  args: string[],
  initialMessage: string,
): Promise<ActionSession> {
  const session = createSession(type, profile.id, initialMessage);
  updateSession(session.id, { status: "starting" });

  const wrappedWrite = process.stdout.write;
  const wrappedErrorWrite = process.stderr.write;
  const outputBuffer: string[] = [];

  const capture = (chunk: unknown): void => {
    const text = typeof chunk === "string" ? chunk : chunk instanceof Buffer ? chunk.toString() : String(chunk);
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return;
    }
    outputBuffer.push(...lines);
    updateSession(session.id, {
      status: "running",
      recentOutput: trimOutput(outputBuffer),
      message: lines[lines.length - 1],
    });
  };

  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    capture(chunk);
    return wrappedWrite.call(process.stdout, chunk as never, ...(rest as never[]));
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
    capture(chunk);
    return wrappedErrorWrite.call(process.stderr, chunk as never, ...(rest as never[]));
  }) as typeof process.stderr.write;

  try {
    const exitCode = await runCodexSubcommand(profile, args, cwd);
    updateSession(session.id, {
      status: exitCode === 0 ? "succeeded" : "failed",
      exitCode,
      finishedAt: new Date().toISOString(),
      recentOutput: trimOutput(outputBuffer),
      message:
        outputBuffer[outputBuffer.length - 1] ??
        (exitCode === 0
          ? `${type === "login" ? "Login" : "Logout"} completed for ${profile.id}.`
          : `${type === "login" ? "Login" : "Logout"} failed with code ${exitCode}.`),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputBuffer.push(message);
    updateSession(session.id, {
      status: "failed",
      exitCode: 1,
      finishedAt: new Date().toISOString(),
      recentOutput: trimOutput(outputBuffer),
      message,
    });
  } finally {
    process.stdout.write = wrappedWrite;
    process.stderr.write = wrappedErrorWrite;
  }

  return getActionSession(session.id) ?? session;
}

async function requireProfile(id: string): Promise<ProfileRecord> {
  const profile = await resolveProfile(id);
  if (!profile) {
    throw new Error(`Unknown profile: ${id}`);
  }
  return profile;
}

export function getGlobalAgentsLocation(): string {
  return getGlobalAgentsPath();
}
