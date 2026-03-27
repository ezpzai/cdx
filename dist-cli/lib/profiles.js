import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProfilesRoot } from "./paths.js";
function hasUsableAuth(profile) {
    return Boolean(profile.auth?.email || profile.auth?.accessToken || profile.auth?.accountId);
}
function compareProfiles(left, right) {
    const leftAuth = hasUsableAuth(left);
    const rightAuth = hasUsableAuth(right);
    if (leftAuth !== rightAuth) {
        return leftAuth ? -1 : 1;
    }
    if (left.source !== right.source) {
        return left.source === "legacy" ? -1 : 1;
    }
    return left.id.localeCompare(right.id, undefined, { numeric: true });
}
function decodeJwtPayload(token) {
    if (!token) {
        return null;
    }
    const parts = token.split(".");
    if (parts.length < 2) {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    }
    catch {
        return null;
    }
}
export function readAuthSummary(homePath) {
    const authPath = path.join(homePath, "auth.json");
    if (!fs.existsSync(authPath)) {
        return null;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(authPath, "utf8"));
        const payload = decodeJwtPayload(parsed.tokens?.id_token);
        const authDetails = payload?.["https://api.openai.com/auth"];
        const authObject = authDetails && typeof authDetails === "object" ? authDetails : null;
        const organizations = Array.isArray(authObject?.organizations)
            ? authObject?.organizations
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
    }
    catch {
        return null;
    }
}
async function listModernProfiles() {
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
            source: "modern",
            auth: readAuthSummary(homePath),
        };
    })
        .sort((left, right) => left.id.localeCompare(right.id));
}
async function listLegacyProfiles() {
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
            source: "legacy",
            auth: readAuthSummary(homePath),
        };
    })
        .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
}
export async function listAllProfilesIncludingDuplicates() {
    return [...(await listModernProfiles()), ...(await listLegacyProfiles())].sort(compareProfiles);
}
export async function listProfiles() {
    const profiles = await listAllProfilesIncludingDuplicates();
    const deduped = new Map();
    for (const profile of profiles) {
        const existing = deduped.get(profile.id);
        if (!existing || compareProfiles(profile, existing) < 0) {
            deduped.set(profile.id, profile);
        }
    }
    return [...deduped.values()].sort(compareProfiles);
}
export async function resolveProfile(id) {
    const profiles = await listProfiles();
    return profiles.find((profile) => profile.id === id) || null;
}
export async function ensureModernProfile(id) {
    const homePath = path.join(getProfilesRoot(), id);
    await fsp.mkdir(homePath, { recursive: true });
    return {
        id,
        homePath,
        source: "modern",
        auth: readAuthSummary(homePath),
    };
}
