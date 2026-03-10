import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getUsageScratchDir } from "./paths.js";
const RUN_OUTPUT_LIMIT = 80;
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_OSC_PATTERN = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, "g");
const ANSI_CSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");
const ANSI_SINGLE_PATTERN = new RegExp(`${ESC}[@-_]`, "g");
function escapeRegExp(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function formatTomlProjectHeader(projectPath) {
    return `[projects.${JSON.stringify(projectPath)}]`;
}
function upsertProjectTrust(configText, projectPath) {
    const header = formatTomlProjectHeader(projectPath);
    const sectionPattern = new RegExp(`(^|\\n)${escapeRegExp(header)}\\n([\\s\\S]*?)(?=\\n\\[[^\\n]+\\]|$)`);
    const trustLinePattern = /(^|\n)trust_level\s*=\s*"[^"\n]*"/;
    if (sectionPattern.test(configText)) {
        return configText.replace(sectionPattern, (_fullMatch, prefix, body) => {
            const normalizedBody = trustLinePattern.test(body)
                ? body.replace(trustLinePattern, '$1trust_level = "trusted"')
                : `trust_level = "trusted"\n${body}`;
            return `${prefix}${header}\n${normalizedBody}`;
        });
    }
    const trimmed = configText.trimEnd();
    const separator = trimmed.length > 0 ? "\n\n" : "";
    return `${trimmed}${separator}${header}\ntrust_level = "trusted"\n`;
}
async function getTrustedProjectPaths(cwd) {
    const resolvedPath = path.resolve(cwd);
    const paths = new Set([resolvedPath]);
    try {
        const realPath = await fsp.realpath(resolvedPath);
        paths.add(realPath);
    }
    catch {
        // Ignore realpath failures and trust the requested cwd only.
    }
    return [...paths];
}
export async function ensureTrustedCodexWorkspace(profile, cwd) {
    const configPath = path.join(profile.homePath, "config.toml");
    await fsp.mkdir(profile.homePath, { recursive: true });
    let configText = "";
    if (fs.existsSync(configPath)) {
        configText = await fsp.readFile(configPath, "utf8");
    }
    let nextText = configText;
    for (const projectPath of await getTrustedProjectPaths(cwd)) {
        nextText = upsertProjectTrust(nextText, projectPath);
    }
    if (nextText !== configText) {
        await fsp.writeFile(configPath, nextText, "utf8");
    }
}
function stripAnsi(input) {
    return input
        .replace(ANSI_OSC_PATTERN, "")
        .replace(ANSI_CSI_PATTERN, "")
        .replace(ANSI_SINGLE_PATTERN, "")
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
function trimOutput(lines) {
    return lines.slice(-RUN_OUTPUT_LIMIT);
}
function appendOutput(lines, chunk) {
    const nextLines = chunk
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (nextLines.length === 0) {
        return lines;
    }
    return trimOutput([...lines, ...nextLines]);
}
export async function runCodex(profile, args, cwd, options = {}) {
    ensureCodexBinary();
    await ensureTrustedCodexWorkspace(profile, cwd);
    const captureOutput = options.captureOutput ?? false;
    return await new Promise((resolve, reject) => {
        let recentOutput = [];
        const child = spawn("codex", args, {
            cwd,
            stdio: captureOutput ? ["inherit", "pipe", "pipe"] : "inherit",
            env: {
                ...process.env,
                CODEX_HOME: profile.homePath,
            },
        });
        if (captureOutput) {
            child.stdout?.on("data", (chunk) => {
                process.stdout.write(chunk);
                recentOutput = appendOutput(recentOutput, chunk);
            });
            child.stderr?.on("data", (chunk) => {
                process.stderr.write(chunk);
                recentOutput = appendOutput(recentOutput, chunk);
            });
        }
        child.on("error", reject);
        child.on("exit", (code, signal) => {
            if (signal) {
                resolve({
                    exitCode: 1,
                    recentOutput,
                });
                return;
            }
            resolve({
                exitCode: code ?? 0,
                recentOutput,
            });
        });
    });
}
export async function runCodexSubcommand(profile, args, cwd) {
    ensureCodexBinary();
    await ensureTrustedCodexWorkspace(profile, cwd);
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
