import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
const TRYCLOUDFLARE_PATTERN = /https:\/\/[-a-z0-9]+\.trycloudflare\.com/iu;
const require = createRequire(import.meta.url);
const qrcodeModule = require("qrcode-terminal");
const qrcodeApi = (typeof qrcodeModule.generate === "function" ? qrcodeModule : null) ??
    (qrcodeModule.default && typeof qrcodeModule.default.generate === "function" ? qrcodeModule.default : null);
const CLOUDFLARED_MISSING_MESSAGE = "`cloudflared` was not found in PATH. Install it first to use `cdx remote` with Cloudflare Quick Tunnel.";
const ANSI_RESET = "\u001B[0m";
const ANSI_BOLD = "\u001B[1m";
const ANSI_DIM = "\u001B[2m";
const ANSI_CYAN = "\u001B[36m";
const ANSI_BRIGHT_CYAN = "\u001B[96m";
const ANSI_BRIGHT_YELLOW = "\u001B[93m";
const ANSI_UNDERLINE = "\u001B[4m";
function commandAvailable(name) {
    const result = spawnSync("which", [name], { encoding: "utf8" });
    return result.status === 0;
}
function collectTryCloudflareUrl(chunk) {
    return chunk.match(TRYCLOUDFLARE_PATTERN)?.[0] ?? null;
}
function style(text, ...codes) {
    return `${codes.join("")}${text}${ANSI_RESET}`;
}
export function ensureCloudflaredBinary() {
    if (!commandAvailable("cloudflared")) {
        throw new Error(CLOUDFLARED_MISSING_MESSAGE);
    }
}
export function isCloudflaredMissingError(error) {
    return error instanceof Error && error.message === CLOUDFLARED_MISSING_MESSAGE;
}
export function formatCloudflaredInstallHelp() {
    const lines = [
        "`cdx remote` defaults to Cloudflare Quick Tunnel for the external mobile link.",
        "",
        "Install `cloudflared` and run `cdx remote` again:",
        ...getInstallInstructions(),
        "",
        "If you want to keep testing without Cloudflare right now:",
        "  - local only: `cdx remote --tunnel none`",
        "  - same Wi-Fi/LAN: `cdx remote --tunnel none --lan`",
        "",
        "Official docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    ];
    return lines.join("\n");
}
function getInstallInstructions() {
    if (process.platform === "darwin") {
        return [
            "  - quick install: `brew install cloudflared`",
            "  - manual binary: https://github.com/cloudflare/cloudflared/releases/latest",
        ];
    }
    if (process.platform === "linux") {
        const binaryName = getCloudflaredLinuxBinaryName();
        return [
            `  - quick install: \`curl -Lo cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/${binaryName} && chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/\``,
            "  - apt repo setup: https://pkg.cloudflare.com/index.html",
        ];
    }
    return [
        "  - quick install: download the release binary and place `cloudflared` in your PATH",
        "  - releases: https://github.com/cloudflare/cloudflared/releases/latest",
    ];
}
function getCloudflaredLinuxBinaryName() {
    switch (process.arch) {
        case "arm64":
            return "cloudflared-linux-arm64";
        case "arm":
            return "cloudflared-linux-arm";
        case "x64":
        default:
            return "cloudflared-linux-amd64";
    }
}
export async function startQuickTunnel(localUrl, timeoutMs = 20_000) {
    ensureCloudflaredBinary();
    const child = spawn("cloudflared", ["tunnel", "--url", localUrl, "--protocol", "http2", "--no-autoupdate"], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    const logs = [];
    let publicUrl = null;
    const readChunk = (source) => (chunk) => {
        const text = chunk.toString();
        logs.push(`[${source}] ${text.trimEnd()}`);
        if (!publicUrl) {
            publicUrl = collectTryCloudflareUrl(text);
        }
    };
    child.stdout.on("data", readChunk("stdout"));
    child.stderr.on("data", readChunk("stderr"));
    const exitPromise = once(child, "exit").then(([code, signal]) => ({
        code: typeof code === "number" ? code : null,
        signal: typeof signal === "string" ? signal : null,
    }));
    const readyPromise = new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
            if (publicUrl) {
                clearInterval(timer);
                resolve(publicUrl);
                return;
            }
            if (Date.now() - start >= timeoutMs) {
                clearInterval(timer);
                reject(new Error("Timed out while waiting for Cloudflare Quick Tunnel to return a public URL."));
            }
        }, 120);
        exitPromise.then(({ code, signal }) => {
            clearInterval(timer);
            reject(new Error(`Cloudflare Quick Tunnel exited before startup${code !== null ? ` (code ${code})` : ""}${signal ? ` (signal ${signal})` : ""}.`));
        }).catch(reject);
    });
    try {
        const resolvedUrl = await readyPromise;
        return {
            publicUrl: resolvedUrl,
            logs,
            stop: () => stopChild(child),
        };
    }
    catch (error) {
        await stopChild(child);
        throw error;
    }
}
async function stopChild(child) {
    if (child.killed || child.exitCode !== null) {
        return;
    }
    child.kill("SIGTERM");
    const result = await Promise.race([
        once(child, "exit").then(() => "exited"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 2_000)),
    ]);
    if (result === "timeout" && !child.killed && child.exitCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
    }
}
export function buildRemoteShareUrl(publicBaseUrl, inviteToken) {
    const url = new URL(publicBaseUrl);
    url.searchParams.set("t", inviteToken);
    return url.toString();
}
export async function renderTerminalQr(shareUrl) {
    if (!qrcodeApi) {
        throw new Error("`qrcode-terminal` could not be loaded correctly.");
    }
    return await new Promise((resolve) => {
        qrcodeApi.generate?.(shareUrl, { small: true }, (output) => resolve(compactQrText(output)));
    });
}
export function formatRemoteBanner(input) {
    const title = style("cdx remote", ANSI_BOLD, ANSI_BRIGHT_CYAN);
    const mobileLinkLabel = style("Mobile link:", ANSI_BOLD, ANSI_CYAN);
    const otpCodeLabel = style("OTP code:   ", ANSI_BOLD, ANSI_BRIGHT_YELLOW);
    const otpExpiresLabel = style("OTP expires:", ANSI_BOLD, ANSI_CYAN);
    const shareUrl = style(input.shareUrl, ANSI_UNDERLINE, ANSI_BRIGHT_CYAN);
    const otpCode = style(input.otpCode, ANSI_BOLD, ANSI_BRIGHT_YELLOW);
    const otpExpires = style(input.otpExpiresLabel, ANSI_BOLD);
    const lines = [
        "",
        title,
        "",
        `${mobileLinkLabel} ${shareUrl}`,
        `${otpCodeLabel} ${otpCode}`,
        `${otpExpiresLabel} ${otpExpires}`,
        "",
        style("Cloudflare Quick Tunnel is convenient but should be treated as an external beta/testing path.", ANSI_DIM),
        style("Share the link or scan the QR code from your phone.", ANSI_DIM),
        style("Only trusted devices skip OTP on future sessions.", ANSI_DIM),
        "",
    ];
    if (input.qrText.trim()) {
        lines.splice(6, 0, input.qrText, "");
    }
    return lines.join("\n");
}
function compactQrText(output) {
    const lines = output.split("\n").map((line) => line.replace(/\s+$/u, ""));
    while (lines[0]?.trim().length === 0) {
        lines.shift();
    }
    while (lines[lines.length - 1]?.trim().length === 0) {
        lines.pop();
    }
    return lines.join("\n");
}
