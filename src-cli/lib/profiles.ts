import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProfilesRoot } from "./paths.js";

export interface AuthSummary {
  email: string | null;
  plan: string | null;
  organization: string | null;
  accountId: string | null;
  accessToken: string | null;
  lastRefresh: string | null;
}

export interface ProfileRecord {
  id: string;
  homePath: string;
  source: "modern" | "legacy";
  auth: AuthSummary | null;
}

interface AuthFileShape {
  last_refresh?: string;
  tokens?: {
    id_token?: string;
    access_token?: string;
    account_id?: string;
  };
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readAuthSummary(homePath: string): AuthSummary | null {
  const authPath = path.join(homePath, "auth.json");
  if (!fs.existsSync(authPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(authPath, "utf8")) as AuthFileShape;
    const payload = decodeJwtPayload(parsed.tokens?.id_token);
    const authDetails = payload?.["https://api.openai.com/auth"];
    const authObject =
      authDetails && typeof authDetails === "object" ? (authDetails as Record<string, unknown>) : null;
    const organizations = Array.isArray(authObject?.organizations)
      ? (authObject?.organizations as Array<Record<string, unknown>>)
      : [];
    const defaultOrg = organizations.find((org) => org.is_default) || organizations[0];

    return {
      email: typeof payload?.email === "string" ? payload.email : null,
      plan: typeof authObject?.chatgpt_plan_type === "string" ? authObject.chatgpt_plan_type : null,
      organization: typeof defaultOrg?.title === "string" ? defaultOrg.title : null,
      accountId: typeof parsed.tokens?.account_id === "string" ? parsed.tokens.account_id : null,
      accessToken: typeof parsed.tokens?.access_token === "string" ? parsed.tokens.access_token : null,
      lastRefresh: typeof parsed.last_refresh === "string" ? parsed.last_refresh : null,
    };
  } catch {
    return null;
  }
}

async function listModernProfiles(): Promise<ProfileRecord[]> {
  const root = getProfilesRoot();
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = await fsp.readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const homePath = path.join(root, entry.name);
      return {
        id: entry.name,
        homePath,
        source: "modern" as const,
        auth: readAuthSummary(homePath),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function listLegacyProfiles(): Promise<ProfileRecord[]> {
  const home = os.homedir();
  const entries = await fsp.readdir(home, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name === ".codex" || /^\.codex\d+$/.test(entry.name))
    .map((entry) => {
      const homePath = path.join(home, entry.name);
      return {
        id: entry.name.slice(1),
        homePath,
        source: "legacy" as const,
        auth: readAuthSummary(homePath),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
}

export async function listProfiles(): Promise<ProfileRecord[]> {
  const profiles = [...(await listModernProfiles()), ...(await listLegacyProfiles())];
  const deduped = new Map<string, ProfileRecord>();
  for (const profile of profiles) {
    if (!deduped.has(profile.id)) {
      deduped.set(profile.id, profile);
    }
  }
  return [...deduped.values()];
}

export async function resolveProfile(id: string): Promise<ProfileRecord | null> {
  const profiles = await listProfiles();
  return profiles.find((profile) => profile.id === id) || null;
}

export async function ensureModernProfile(id: string): Promise<ProfileRecord> {
  const homePath = path.join(getProfilesRoot(), id);
  await fsp.mkdir(homePath, { recursive: true });
  return {
    id,
    homePath,
    source: "modern",
    auth: readAuthSummary(homePath),
  };
}
