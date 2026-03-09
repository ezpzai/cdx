import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { ensureGlobalAgentsFile, ensureGlobalAgentsLink, getAgentsStatus } from "./agents.js";
import { runCodexSubcommand, ensureCodexBinary } from "./codex.js";
import { getGlobalAgentsPath } from "./paths.js";
import { ensureModernProfile, listProfiles, resolveProfile } from "./profiles.js";
import { getDashboardPayload } from "./dashboard.js";
const actionSessions = new Map();
const SESSION_OUTPUT_LIMIT = 40;
function trimOutput(lines) {
    return lines.slice(-SESSION_OUTPUT_LIMIT);
}
function appendOutput(sessionId, chunk) {
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
function updateSession(sessionId, patch) {
    const current = actionSessions.get(sessionId);
    if (!current) {
        throw new Error(`Unknown action session: ${sessionId}`);
    }
    const next = { ...current, ...patch };
    actionSessions.set(sessionId, next);
    return next;
}
function createSession(type, profileId, message) {
    const session = {
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
export function getActionSession(sessionId) {
    return actionSessions.get(sessionId) ?? null;
}
export async function createProfile(profileId) {
    if (!profileId.trim()) {
        throw new Error("Profile name is required.");
    }
    return ensureModernProfile(profileId.trim());
}
export async function prepareGlobalAgentsFile(cwd) {
    const filePath = await ensureGlobalAgentsFile();
    const status = await getAgentsStatus(cwd);
    return { filePath, status };
}
export async function getDoctorReport(cwd) {
    const payload = await getDashboardPayload(cwd);
    return {
        generatedAt: payload.generatedAt,
        doctor: payload.doctor,
    };
}
export async function listAvailableProfiles() {
    return listProfiles();
}
export async function startRunSession(profileId, cwd, args = []) {
    const profile = await requireProfile(profileId);
    ensureCodexBinary();
    await ensureGlobalAgentsLink(cwd);
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
    child.stdout.on("data", (chunk) => {
        appendOutput(session.id, chunk.toString());
        updateSession(session.id, { status: "running" });
    });
    child.stderr.on("data", (chunk) => {
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
            message: current?.recentOutput[current.recentOutput.length - 1] ??
                (succeeded ? `Codex exited successfully for ${profile.id}.` : `Codex exited with code ${code ?? 0}.`),
        });
    });
    return getActionSession(session.id) ?? session;
}
export async function startLoginSession(profileId, cwd) {
    const profile = (await resolveProfile(profileId)) || (await ensureModernProfile(profileId));
    return startSubcommandSession("login", profile, cwd, ["login"], `Starting login for ${profile.id}...`);
}
export async function startLogoutSession(profileId, cwd) {
    const profile = await requireProfile(profileId);
    return startSubcommandSession("logout", profile, cwd, ["logout"], `Starting logout for ${profile.id}...`);
}
async function startSubcommandSession(type, profile, cwd, args, initialMessage) {
    const session = createSession(type, profile.id, initialMessage);
    updateSession(session.id, { status: "starting" });
    const wrappedWrite = process.stdout.write;
    const wrappedErrorWrite = process.stderr.write;
    const outputBuffer = [];
    const capture = (chunk) => {
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
    process.stdout.write = ((chunk, ...rest) => {
        capture(chunk);
        return wrappedWrite.call(process.stdout, chunk, ...rest);
    });
    process.stderr.write = ((chunk, ...rest) => {
        capture(chunk);
        return wrappedErrorWrite.call(process.stderr, chunk, ...rest);
    });
    try {
        const exitCode = await runCodexSubcommand(profile, args, cwd);
        updateSession(session.id, {
            status: exitCode === 0 ? "succeeded" : "failed",
            exitCode,
            finishedAt: new Date().toISOString(),
            recentOutput: trimOutput(outputBuffer),
            message: outputBuffer[outputBuffer.length - 1] ??
                (exitCode === 0
                    ? `${type === "login" ? "Login" : "Logout"} completed for ${profile.id}.`
                    : `${type === "login" ? "Login" : "Logout"} failed with code ${exitCode}.`),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputBuffer.push(message);
        updateSession(session.id, {
            status: "failed",
            exitCode: 1,
            finishedAt: new Date().toISOString(),
            recentOutput: trimOutput(outputBuffer),
            message,
        });
    }
    finally {
        process.stdout.write = wrappedWrite;
        process.stderr.write = wrappedErrorWrite;
    }
    return getActionSession(session.id) ?? session;
}
async function requireProfile(id) {
    const profile = await resolveProfile(id);
    if (!profile) {
        throw new Error(`Unknown profile: ${id}`);
    }
    return profile;
}
export function getGlobalAgentsLocation() {
    return getGlobalAgentsPath();
}
