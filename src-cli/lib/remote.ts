import crypto from "node:crypto";
import fsp from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import xtermHeadless from "@xterm/headless";
import * as pty from "node-pty";
import WebSocket, { WebSocketServer } from "ws";
import { ensureGlobalAgentsLink } from "./agents.js";
import { ensureCodexBinary, ensureTrustedCodexWorkspace } from "./codex.js";
import { ensureSessionStorageForProfile } from "./session-storage.js";
import type { RunMode } from "./config.js";
import type { ProfileRecord } from "./profiles.js";
import { issueTrustedDevice, resolveTrustedDevice, touchTrustedDevice, type TrustedDeviceRecord } from "./remote-devices.js";
import { buildRemoteShareUrl, formatRemoteBanner, renderTerminalQr, startQuickTunnel, type QuickTunnelHandle } from "./remote-tunnel.js";
import { renderRemotePage } from "./remote-web.js";
import { getModeFlags } from "./run-flow.js";

const { Terminal } = xtermHeadless;
type HeadlessTerminal = InstanceType<typeof Terminal>;

const OUTPUT_LIMIT = 160;
const STARTUP_SCAN_LIMIT = 16_000;
const AUTH_COOKIE = "cdx_remote_auth";
const TRUSTED_DEVICE_COOKIE = "cdx_remote_device";
const EVENT_LIMIT = 120;
const DESKTOP_INPUT_LOCK_MS = 1200;
const REMOTE_INPUT_LOCK_MS = 4000;
const BRACKETED_PASTE_START = "\u001B[200~";
const BRACKETED_PASTE_END = "\u001B[201~";
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI_OSC_PATTERN = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, "g");
const ANSI_CSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");
const ANSI_SINGLE_PATTERN = new RegExp(`${ESC}[@-_]`, "g");
const TRUST_PROMPT_PATTERN = /Do you trust the contents of this directory\?/;
const TRUST_READY_PATTERN =
  /(Tip:|To get started|context left|100% left|\/status - show current session configuration|OpenAI Codex)/;
const require = createRequire(import.meta.url);
const REMOTE_WEB_ASSETS = new Map<string, { filePath: string; contentType: string }>([
  [
    "/__cdx/remote/xterm.js",
    {
      filePath: require.resolve("@xterm/xterm/lib/xterm.js"),
      contentType: "application/javascript; charset=utf-8",
    },
  ],
  [
    "/__cdx/remote/xterm-addon-fit.js",
    {
      filePath: require.resolve("@xterm/addon-fit/lib/addon-fit.js"),
      contentType: "application/javascript; charset=utf-8",
    },
  ],
  [
    "/__cdx/remote/xterm.css",
    {
      filePath: require.resolve("@xterm/xterm/css/xterm.css"),
      contentType: "text/css; charset=utf-8",
    },
  ],
]);

type RemoteSessionStatus = "starting" | "running" | "succeeded" | "failed";

class InvalidJsonBodyError extends Error {
  constructor(message = "Malformed JSON body.") {
    super(message);
    this.name = "InvalidJsonBodyError";
  }
}

interface AuthSession {
  id: string;
  deviceId: string | null;
  label: string;
}

export interface RemoteSessionSnapshot {
  id: string;
  profileId: string;
  mode: RunMode;
  status: RemoteSessionStatus;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  recentOutput: string[];
  publicUrl: string;
}

export interface StartRemoteSessionOptions {
  profile: ProfileRecord;
  mode: RunMode;
  codexArgs: string[];
  cwd: string;
  tunnel: "cloudflare" | "none";
  bindHost: string;
  printQr: boolean;
}

interface OtpState {
  code: string;
  expiresAt: number;
  attempts: number;
  lockedUntil: number;
}

interface InputLockState {
  owner: "desktop" | "remote" | null;
  label: string | null;
  expiresAt: number;
}

interface RemoteEventEnvelope {
  eventId: number;
  type: "snapshot" | "output" | "status" | "pty";
  snapshot?: RemoteSessionSnapshot;
  recentOutput?: string[];
  status?: RemoteSessionStatus;
  chunk?: string;
}

function trimOutput(lines: string[]): string[] {
  return lines.slice(-OUTPUT_LIMIT);
}

function stripAnsi(input: string): string {
  return input
    .replace(ANSI_OSC_PATTERN, "")
    .replace(ANSI_CSI_PATTERN, "")
    .replace(ANSI_SINGLE_PATTERN, "")
    .replace(/\r/g, "");
}

function renderTerminalLines(terminal: HeadlessTerminal): string[] {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  let pendingWrapped = "";

  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index);
    if (!line) {
      continue;
    }

    const text = line.translateToString(true);
    if (line.isWrapped) {
      pendingWrapped += text;
      continue;
    }

    const nextLine = `${pendingWrapped}${text}`.trimEnd();
    pendingWrapped = "";
    if (nextLine.length === 0) {
      if (lines[lines.length - 1] !== "") {
        lines.push("");
      }
      continue;
    }
    lines.push(nextLine);
  }

  const tail = pendingWrapped.trimEnd();
  if (tail) {
    lines.push(tail);
  }

  while (lines[0] === "") {
    lines.shift();
  }
  while (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return trimOutput(lines);
}

function formatPromptForSubmission(prompt: string): string {
  const normalized = prompt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}\r`;
}

function createOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function formatTimestampLabel(value: number): string {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function createInviteToken(secret: string, sessionId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sid: sessionId,
      exp: Date.now() + 60 * 60_000,
    }),
    "utf8",
  ).toString("base64url");

  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validateInviteToken(secret: string, sessionId: string, token: string | null): boolean {
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sid?: string; exp?: number };
    return decoded.sid === sessionId && typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

function serializeCookie(name: string, value: string, options: {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax";
  path?: string;
} = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.httpOnly ?? true) {
    parts.push("HttpOnly");
  }
  if (options.secure ?? true) {
    parts.push("Secure");
  }
  parts.push(`SameSite=${options.sameSite ?? "Strict"}`);
  return parts.join("; ");
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown, cookies: string[] = []): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cookies.length > 0) {
    res.setHeader("Set-Cookie", cookies);
  }
  res.end(JSON.stringify(payload));
}

function sendHtml(res: ServerResponse, html: string, cookies: string[] = []): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (cookies.length > 0) {
    res.setHeader("Set-Cookie", cookies);
  }
  res.end(html);
}

async function sendStaticAsset(res: ServerResponse, filePath: string, contentType: string): Promise<void> {
  try {
    const contents = await fsp.readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.end(contents);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new InvalidJsonBodyError();
  }
}

function summarizeDevice(req: IncomingMessage): string {
  const userAgent = req.headers["user-agent"] || "Unknown device";
  return userAgent.replace(/\s+/g, " ").slice(0, 72);
}

function requestUsesSecureCookies(req: IncomingMessage): boolean {
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader;
  if (typeof forwardedProto === "string" && forwardedProto.trim().length > 0) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
  }

  const forwardedHeader = req.headers.forwarded;
  const forwardedValue = Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader;
  if (typeof forwardedValue === "string") {
    const match = forwardedValue.match(/proto=(?:\"([^\"]+)\"|([^;,\s]+))/i);
    const proto = (match?.[1] ?? match?.[2] ?? "").trim().toLowerCase();
    if (proto.length > 0) {
      return proto === "https";
    }
  }

  const cfVisitorHeader = req.headers["cf-visitor"];
  const cfVisitor = Array.isArray(cfVisitorHeader) ? cfVisitorHeader[0] : cfVisitorHeader;
  if (typeof cfVisitor === "string") {
    try {
      const parsed = JSON.parse(cfVisitor) as { scheme?: string };
      if (typeof parsed.scheme === "string" && parsed.scheme.trim().length > 0) {
        return parsed.scheme.trim().toLowerCase() === "https";
      }
    } catch {
      // Ignore malformed proxy metadata.
    }
  }

  return "encrypted" in req.socket && req.socket.encrypted === true;
}

function readAuthToken(req: IncomingMessage, url?: URL | null): string | null {
  const header = req.headers["x-cdx-auth"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  const queryValue = url?.searchParams.get("a");
  return queryValue && queryValue.trim().length > 0 ? queryValue.trim() : null;
}

export async function startRemoteSession(
  options: StartRemoteSessionOptions,
): Promise<{ exitCode: number; publicUrl: string | null; shareUrl: string }> {
  const { profile, mode, codexArgs, cwd, tunnel: tunnelMode, bindHost, printQr } = options;
  ensureCodexBinary();
  await ensureGlobalAgentsLink(cwd);

  const remoteSessionId = crypto.randomUUID();
  const inviteSecret = crypto.randomBytes(32).toString("base64url");
  const inviteToken = createInviteToken(inviteSecret, remoteSessionId);
  const otp: OtpState = {
    code: createOtpCode(),
    expiresAt: Date.now() + 60 * 60_000,
    attempts: 0,
    lockedUntil: 0,
  };
  const otpExpiresLabel = formatTimestampLabel(otp.expiresAt);

  const snapshot: RemoteSessionSnapshot = {
    id: remoteSessionId,
    profileId: profile.id,
    mode,
    status: "starting",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    recentOutput: [],
    publicUrl: "",
  };

  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Set<WebSocket>();
  const eventLog: RemoteEventEnvelope[] = [];
  let tunnel: QuickTunnelHandle | null = null;
  let authSession: AuthSession | null = null;
  let cleanedUp = false;
  let ptyProcess: pty.IPty | null = null;
  const viewportRows = Math.max(process.stdout.rows || 36, 36);
  const viewportCols = Math.max(process.stdout.columns || 120, 80);
  const mirrorTerminal = new Terminal({
    cols: viewportCols,
    rows: viewportRows,
    scrollback: 5000,
    allowProposedApi: true,
  });
  let nextEventId = 0;
  const inputLock: InputLockState = {
    owner: null,
    label: null,
    expiresAt: 0,
  };

  const getActiveLock = (): InputLockState | null => {
    if (inputLock.owner && inputLock.expiresAt > Date.now()) {
      return { ...inputLock };
    }

    inputLock.owner = null;
    inputLock.label = null;
    inputLock.expiresAt = 0;
    return null;
  };

  const setLock = (owner: "desktop" | "remote", label: string, durationMs: number): void => {
    inputLock.owner = owner;
    inputLock.label = label;
    inputLock.expiresAt = Date.now() + durationMs;
  };

  const broadcast = (payload: unknown): void => {
    const encoded = JSON.stringify(payload);
    for (const client of wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(encoded);
      }
    }
  };

  const publish = (event: Omit<RemoteEventEnvelope, "eventId">): void => {
    const envelope: RemoteEventEnvelope = {
      eventId: ++nextEventId,
      ...event,
    };
    eventLog.push(envelope);
    if (eventLog.length > EVENT_LIMIT) {
      eventLog.splice(0, eventLog.length - EVENT_LIMIT);
    }
    broadcast(envelope);
  };

  const resizeTerminal = (cols: number, rows: number): void => {
    if (!ptyProcess) {
      return;
    }

    const nextCols = Math.max(40, Math.min(400, Math.floor(cols)));
    const nextRows = Math.max(12, Math.min(200, Math.floor(rows)));
    ptyProcess.resize(nextCols, nextRows);
    mirrorTerminal.resize(nextCols, nextRows);
    snapshot.recentOutput = renderTerminalLines(mirrorTerminal);
  };

  const authenticate = async (req: IncomingMessage): Promise<{ cookies: string[]; session: AuthSession | null }> => {
    const cookies = parseCookies(req.headers.cookie);
    const secure = requestUsesSecureCookies(req);
    const trustedDevice = await resolveTrustedDevice(cookies.get(TRUSTED_DEVICE_COOKIE));
    if (!trustedDevice) {
      return { cookies: [], session: null };
    }

    if (authSession && authSession.deviceId === trustedDevice.id) {
      await touchTrustedDevice(trustedDevice.id);
      return {
        cookies: [serializeCookie(AUTH_COOKIE, authSession.id, { maxAge: 24 * 60 * 60, secure })],
        session: authSession,
      };
    }

    authSession = {
      id: crypto.randomUUID(),
      deviceId: trustedDevice.id,
      label: trustedDevice.label,
    };
    return {
      cookies: [serializeCookie(AUTH_COOKIE, authSession.id, { maxAge: 24 * 60 * 60, secure })],
      session: authSession,
    };
  };

  const requireAuth = (req: IncomingMessage, url?: URL | null): AuthSession | null => {
    const cookies = parseCookies(req.headers.cookie);
    const authCookie = cookies.get(AUTH_COOKIE);
    const authToken = authCookie || readAuthToken(req, url);
    if (!authToken) {
      return null;
    }

    return authSession && authSession.id === authToken ? authSession : null;
  };

  server.on("request", async (req, res) => {
    const url = req.url ? new URL(req.url, "http://127.0.0.1") : null;
    if (!url) {
      res.statusCode = 404;
      res.end();
      return;
    }

    const asset = REMOTE_WEB_ASSETS.get(url.pathname);
    if (asset) {
      await sendStaticAsset(res, asset.filePath, asset.contentType);
      return;
    }

    const inviteTokenFromQuery = url.searchParams.get("t");
    const isPageRequest = (req.method === "GET" || req.method === "HEAD") && url.pathname === "/";
    const needsQueryInvite =
      isPageRequest ||
      url.pathname === "/api/session" ||
      url.pathname === "/api/prompts" ||
      url.pathname === "/api/interrupt";

    if (needsQueryInvite && !validateInviteToken(inviteSecret, remoteSessionId, inviteTokenFromQuery)) {
      sendJson(res, 401, { message: "Invite token is missing or expired." });
      return;
    }

    if (isPageRequest) {
      const trusted = await authenticate(req);
      const html = renderRemotePage({
        inviteToken,
        profileId: profile.id,
        mode,
        otpRequired: trusted.session === null,
        otpExpiresLabel,
      });
      if (req.method === "HEAD") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        if (trusted.cookies.length > 0) {
          res.setHeader("Set-Cookie", trusted.cookies);
        }
        res.end();
        return;
      }
      sendHtml(res, html, trusted.cookies);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/otp") {
      let body: Record<string, unknown>;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        if (error instanceof InvalidJsonBodyError) {
          sendJson(res, 400, { message: error.message });
          return;
        }
        throw error;
      }

      if (!validateInviteToken(inviteSecret, remoteSessionId, typeof body.token === "string" ? body.token : null)) {
        sendJson(res, 401, { message: "Invite token is invalid." });
        return;
      }

      if (Date.now() < otp.lockedUntil) {
        sendJson(res, 429, { message: "Too many attempts. Try again shortly." });
        return;
      }

      if (Date.now() > otp.expiresAt) {
        sendJson(res, 410, { message: "OTP expired. Restart `cdx remote` for a new code." });
        return;
      }

      const providedOtp = typeof body.otp === "string" ? body.otp.trim() : "";
      if (providedOtp !== otp.code) {
        otp.attempts += 1;
        if (otp.attempts >= 5) {
          otp.lockedUntil = Date.now() + 60_000;
          otp.attempts = 0;
        }
        sendJson(res, 401, { message: "OTP did not match." });
        return;
      }

      otp.attempts = 0;
      otp.lockedUntil = 0;
      const grant = await issueTrustedDevice(summarizeDevice(req));
      const secure = requestUsesSecureCookies(req);
      authSession = {
        id: crypto.randomUUID(),
        deviceId: grant.record.id,
        label: grant.record.label,
      };
      sendJson(
        res,
        200,
        { ok: true, authToken: authSession.id },
        [
          serializeCookie(AUTH_COOKIE, authSession.id, { maxAge: 24 * 60 * 60, secure }),
          serializeCookie(TRUSTED_DEVICE_COOKIE, grant.cookieValue, { maxAge: 3650 * 24 * 60 * 60, secure }),
        ],
      );
      return;
    }

    const activeAuth = requireAuth(req, url);
    if (!activeAuth) {
      sendJson(res, 401, { message: "Authentication required." });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/session") {
      sendJson(res, 200, snapshot);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/prompts") {
      const body = await readJsonBody(req);
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        sendJson(res, 400, { message: "Prompt is required." });
        return;
      }

      if (!ptyProcess) {
        sendJson(res, 409, { message: "Codex session is not ready yet." });
        return;
      }

      const lock = getActiveLock();
      if (lock) {
        const actor = lock.owner === "desktop" ? "desktop keyboard" : lock.label || "another remote request";
        sendJson(res, 409, { message: `Input is currently locked by ${actor}. Wait a moment and try again.` });
        return;
      }

      setLock("remote", activeAuth.label, REMOTE_INPUT_LOCK_MS);
      ptyProcess.write(formatPromptForSubmission(prompt));
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/interrupt") {
      if (!ptyProcess) {
        sendJson(res, 409, { message: "Codex session is not ready yet." });
        return;
      }
      ptyProcess.write("\u001B");
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { message: "Not found." });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url ? new URL(req.url, "http://127.0.0.1") : null;
    if (!url || url.pathname !== "/api/ws" || !validateInviteToken(inviteSecret, remoteSessionId, url.searchParams.get("t"))) {
      socket.destroy();
      return;
    }

    if (!requireAuth(req, url)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (client: WebSocket) => {
      wss.emit("connection", client, req, url);
    });
  });

  wss.on("connection", (client: WebSocket, req: IncomingMessage, url?: URL) => {
    wsClients.add(client);
    const authSession = requireAuth(req, url);
    if (!authSession) {
      client.close();
      return;
    }
    const cursorRaw = url?.searchParams.get("cursor") ?? null;
    const cursor = cursorRaw ? Number.parseInt(cursorRaw, 10) : null;
    const bootstrapMode = url?.searchParams.get("bootstrap") ?? "";
    if (bootstrapMode === "snapshot") {
      client.send(JSON.stringify({ eventId: ++nextEventId, type: "snapshot", snapshot } satisfies RemoteEventEnvelope));
    } else {
      const replayEvents =
        cursor !== null && Number.isFinite(cursor)
          ? eventLog.filter((item) => item.eventId > cursor)
          : eventLog.filter((item) => item.type === "pty");

      if (replayEvents.length > 0) {
        for (const event of replayEvents) {
          client.send(JSON.stringify(event));
        }
      } else {
        client.send(JSON.stringify({ eventId: ++nextEventId, type: "snapshot", snapshot } satisfies RemoteEventEnvelope));
      }
    }
    client.on("message", (raw) => {
      try {
        const payload = JSON.parse(String(raw)) as { type?: string; cols?: number; rows?: number; data?: string };
        if (payload.type === "resize" && typeof payload.cols === "number" && typeof payload.rows === "number") {
          resizeTerminal(payload.cols, payload.rows);
          return;
        }

        if (payload.type === "input" && typeof payload.data === "string" && payload.data.length > 0 && ptyProcess) {
          const lock = getActiveLock();
          if (lock?.owner === "desktop") {
            return;
          }

          if (lock?.owner === "remote" && lock.label && lock.label !== authSession.label) {
            return;
          }

          setLock("remote", authSession.label, REMOTE_INPUT_LOCK_MS);
          ptyProcess.write(payload.data);
        }
      } catch {
        // Ignore malformed client messages.
      }
    });
    client.on("close", () => {
      wsClients.delete(client);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, bindHost, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Remote server failed to resolve a listening address.");
  }

  const localBaseUrl = `http://${bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost}:${address.port}`;
  let publicUrl: string | null = null;
  if (tunnelMode === "cloudflare") {
    tunnel = await startQuickTunnel(`http://127.0.0.1:${address.port}`);
    publicUrl = tunnel.publicUrl;
  }

  snapshot.publicUrl = publicUrl ?? localBaseUrl;
  const shareBaseUrl = publicUrl ?? localBaseUrl;
  const shareUrl = buildRemoteShareUrl(shareBaseUrl, inviteToken);
  const qrText = printQr ? await renderTerminalQr(shareUrl) : "";
  const remoteBanner = formatRemoteBanner({
    shareUrl,
    otpCode: otp.code,
    otpExpiresLabel,
    qrText,
  });
  const replayRemoteBanner = () => {
    process.stdout.write(remoteBanner);
  };
  replayRemoteBanner();

  const args = [...getModeFlags(mode), "--no-alt-screen", ...codexArgs];
  await ensureSessionStorageForProfile(profile);
  await ensureTrustedCodexWorkspace(profile, cwd);
  ptyProcess = pty.spawn("codex", args, {
    name: "xterm-256color",
    cols: viewportCols,
    rows: viewportRows,
    cwd,
    env: {
      ...process.env,
      CODEX_HOME: profile.homePath,
    },
  });
  let startupText = "";
  let trustPromptSeen = false;
  let trustBannerReplayed = false;

  ptyProcess.onData((chunk) => {
    const plainChunk = stripAnsi(chunk);
    if (plainChunk.length > 0) {
      startupText = `${startupText}${plainChunk}`.slice(-STARTUP_SCAN_LIMIT);
      if (!trustPromptSeen && TRUST_PROMPT_PATTERN.test(startupText)) {
        trustPromptSeen = true;
      }
      if (trustPromptSeen && !trustBannerReplayed && TRUST_READY_PATTERN.test(startupText)) {
        replayRemoteBanner();
        trustBannerReplayed = true;
      }
    }

    snapshot.status = "running";
    process.stdout.write(chunk);
    publish({ type: "pty", chunk });
    mirrorTerminal.write(chunk, () => {
      snapshot.recentOutput = renderTerminalLines(mirrorTerminal);
      publish({ type: "output", recentOutput: snapshot.recentOutput });
      publish({ type: "status", status: snapshot.status });
    });
  });

  const exitPromise = new Promise<number>((resolve) => {
    ptyProcess.onExit(({ exitCode }) => {
      snapshot.recentOutput = renderTerminalLines(mirrorTerminal);
      snapshot.status = exitCode === 0 ? "succeeded" : "failed";
      snapshot.finishedAt = new Date().toISOString();
      snapshot.exitCode = exitCode;
      publish({ type: "snapshot", snapshot });
      resolve(exitCode);
    });
  });

  const resize = () => {
    if (!process.stdout.isTTY) {
      return;
    }
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 36;
    ptyProcess.resize(cols, rows);
    mirrorTerminal.resize(cols, rows);
  };
  process.stdout.on("resize", resize);

  let restoreInput: (() => void) | null = null;
  if (process.stdin.isTTY) {
    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString();
      if (text !== "\u0003" && text !== "\u001B") {
        const lock = getActiveLock();
        if (lock?.owner === "remote") {
          return;
        }
      }

      setLock("desktop", "desktop keyboard", DESKTOP_INPUT_LOCK_MS);
      ptyProcess.write(text);
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    restoreInput = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
  }

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    restoreInput?.();
    process.stdout.off("resize", resize);

    for (const client of wsClients) {
      client.close();
    }
    wss.close();

    if (tunnel) {
      await tunnel.stop();
    }

    server.close();
    await once(server, "close").catch(() => undefined);
  };

  const exitCode = await exitPromise;
  await cleanup();
  return {
    exitCode,
    publicUrl,
    shareUrl,
  };
}

export function formatTrustedDevices(devices: TrustedDeviceRecord[]): string {
  if (devices.length === 0) {
    return "No trusted remote devices.";
  }

  return [
    "Trusted remote devices:",
    "",
    ...devices.map((device) => {
      const status = device.revokedAt ? `revoked ${device.revokedAt}` : `last used ${device.lastUsedAt}`;
      return `- ${device.id}  ${device.label}  (${status})`;
    }),
  ].join("\n");
}
