import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import {
  createProfile,
  getActionSession,
  getDoctorReport,
  prepareGlobalAgentsFile,
  startLoginSession,
  startLogoutSession,
  startRunSession,
} from "./src-cli/lib/actions.js";
import { getDashboardPayload } from "./src-cli/lib/dashboard.js";

interface ApiErrorPayload {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendOk(res: ServerResponse, payload: unknown): void {
  sendJson(res, 200, { ok: true, data: payload });
}

function sendError(res: ServerResponse, statusCode: number, code: string, message: string, details?: unknown): void {
  const payload: ApiErrorPayload = {
    ok: false,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
  sendJson(res, statusCode, payload);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ? new URL(req.url, "http://localhost") : null;
  if (!url) {
    return false;
  }

  const cwd = process.cwd();

  try {
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      const payload = await getDashboardPayload(cwd);
      sendOk(res, payload);
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/doctor") {
      const report = await getDoctorReport(cwd);
      sendOk(res, report);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/profiles") {
      const body = await readJsonBody(req);
      const profileId = typeof body.profileId === "string" ? body.profileId : "";
      if (!profileId.trim()) {
        sendError(res, 400, "invalid_profile", "Profile name is required.");
        return true;
      }

      const profile = await createProfile(profileId);
      sendOk(res, {
        id: profile.id,
        homePath: profile.homePath,
      });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/run-sessions") {
      const body = await readJsonBody(req);
      const profileId = typeof body.profileId === "string" ? body.profileId : "";
      if (!profileId.trim()) {
        sendError(res, 400, "invalid_profile", "Profile name is required.");
        return true;
      }

      const session = await startRunSession(profileId, cwd);
      sendOk(res, session);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/login-sessions") {
      const body = await readJsonBody(req);
      const profileId = typeof body.profileId === "string" ? body.profileId : "";
      if (!profileId.trim()) {
        sendError(res, 400, "invalid_profile", "Profile name is required.");
        return true;
      }

      const session = await startLoginSession(profileId, cwd);
      sendOk(res, session);
      return true;
    }

    if (req.method === "POST" && /^\/api\/profiles\/[^/]+\/logout$/.test(url.pathname)) {
      const profileId = decodeURIComponent(url.pathname.split("/")[3] || "");
      if (!profileId.trim()) {
        sendError(res, 400, "invalid_profile", "Profile name is required.");
        return true;
      }

      const session = await startLogoutSession(profileId, cwd);
      sendOk(res, session);
      return true;
    }

    if (req.method === "GET" && /^\/api\/action-sessions\/[^/]+$/.test(url.pathname)) {
      const sessionId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const session = getActionSession(sessionId);
      if (!session) {
        sendError(res, 404, "unknown_session", `Unknown action session: ${sessionId}`);
        return true;
      }

      sendOk(res, session);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/agents/global-file") {
      const prepared = await prepareGlobalAgentsFile(cwd);
      sendOk(res, prepared);
      return true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API error";
    sendError(res, 500, "internal_error", message);
    return true;
  }

  return false;
}

function cdxApiPlugin(): Plugin {
  return {
    name: "cdx-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest(req, res).then((handled) => {
          if (!handled) {
            next();
          }
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleApiRequest(req, res).then((handled) => {
          if (!handled) {
            next();
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cdxApiPlugin()],
});
