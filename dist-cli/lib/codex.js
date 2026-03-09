import { spawn, spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { getUsageScratchDir } from "./paths.js";
function stripAnsi(input) {
    return input
        .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
        .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "")
        .replace(/\u001B[@-_]/g, "")
        .replace(/\r/g, "");
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitForPattern(getText, pattern, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (pattern.test(getText())) {
            return true;
        }
        await wait(150);
    }
    return false;
}
function commandAvailable(name) {
    const result = spawnSync("which", [name], { encoding: "utf8" });
    return result.status === 0;
}
export function ensureCodexBinary() {
    if (!commandAvailable("codex")) {
        throw new Error("`codex` was not found in PATH.");
    }
}
export function ensureScriptBinary() {
    if (process.platform === "win32") {
        throw new Error("`cdx usage` is not implemented on Windows yet.");
    }
    if (!commandAvailable("script")) {
        throw new Error("`script` was not found. It is required for `cdx usage`.");
    }
}
export async function runCodex(profile, args, cwd) {
    ensureCodexBinary();
    return await new Promise((resolve, reject) => {
        const child = spawn("codex", args, {
            cwd,
            stdio: "inherit",
            env: {
                ...process.env,
                CODEX_HOME: profile.homePath,
            },
        });
        child.on("error", reject);
        child.on("exit", (code, signal) => {
            if (signal) {
                resolve(1);
                return;
            }
            resolve(code ?? 0);
        });
    });
}
export async function runCodexSubcommand(profile, args, cwd) {
    ensureCodexBinary();
    return await new Promise((resolve, reject) => {
        const child = spawn("codex", args, {
            cwd,
            stdio: "inherit",
            env: {
                ...process.env,
                CODEX_HOME: profile.homePath,
            },
        });
        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? 0));
    });
}
function parseStatusSnapshot(rawText) {
    const lines = rawText
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean);
    const text = lines.join("\n");
    const account = text.match(/Account:\s+([^\n]+)/)?.[1]?.trim() ?? null;
    const model = text.match(/Model:\s+([^\n]+)/)?.[1]?.trim() ?? null;
    const agents = text.match(/Agents\.md:\s+([^\n]+)/)?.[1]?.trim() ?? null;
    const sessionId = text.match(/Session:\s+([^\n]+)/)?.[1]?.trim() ?? null;
    const fiveHourMatch = text.match(/5h limit:\s+\[[^\]]+\]\s+(\d+)% left\s+\(resets ([^)]+)\)/);
    const weeklyMatch = text.match(/Weekly limit:\s+\[[^\]]+\]\s+(\d+)% left[\s\S]*?\(resets ([^)]+)\)/);
    return {
        account,
        model,
        agents,
        sessionId,
        fiveHourLeft: fiveHourMatch ? Number(fiveHourMatch[1]) : null,
        fiveHourReset: fiveHourMatch?.[2] ?? null,
        weeklyLeft: weeklyMatch ? Number(weeklyMatch[1]) : null,
        weeklyReset: weeklyMatch?.[2] ?? null,
        rawText: text,
    };
}
export async function fetchCodexStatus(profile) {
    ensureCodexBinary();
    ensureScriptBinary();
    await fsp.mkdir(getUsageScratchDir(), { recursive: true });
    const scratchDir = await fsp.mkdtemp(path.join(getUsageScratchDir(), "session-"));
    const shellCommand = `codex --no-alt-screen -C ${JSON.stringify(scratchDir)}`;
    const child = spawn("script", ["-qfec", shellCommand, "/dev/null"], {
        env: {
            ...process.env,
            CODEX_HOME: profile.homePath,
        },
        stdio: ["pipe", "pipe", "pipe"],
    });
    let rawOutput = "";
    child.stdout.on("data", (chunk) => {
        rawOutput += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
        rawOutput += chunk.toString();
    });
    try {
        await waitForPattern(() => stripAnsi(rawOutput), /(Do you trust the contents of this directory\?|OpenAI Codex)/, 20_000);
        const initialText = stripAnsi(rawOutput);
        if (initialText.includes("Do you trust the contents of this directory?")) {
            child.stdin.write("\r");
        }
        const ready = await waitForPattern(() => stripAnsi(rawOutput), /(Tip:|To get started|context left|100% left|\/status - show current session configuration)/, 25_000);
        if (!ready) {
            throw new Error("Timed out while waiting for Codex to become ready.");
        }
        child.stdin.write("\u0015/status\r");
        const statusReady = await waitForPattern(() => stripAnsi(rawOutput), /5h limit:\s+\[[^\]]+\]\s+\d+% left[\s\S]*Weekly limit:\s+\[[^\]]+\]\s+\d+% left/, 20_000);
        if (!statusReady) {
            throw new Error("Timed out while waiting for `/status` output.");
        }
        return parseStatusSnapshot(stripAnsi(rawOutput));
    }
    finally {
        child.kill("SIGTERM");
        await fsp.rm(scratchDir, { recursive: true, force: true });
    }
}
