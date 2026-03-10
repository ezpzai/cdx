import fsp from "node:fs/promises";
import path from "node:path";
import { getCdxConfigPath } from "./paths.js";

export const CONFIG_SCHEMA_VERSION = 1;
export const RUN_MODES = ["safe", "balanced", "yolo"] as const;

export type RunMode = (typeof RUN_MODES)[number];

export interface ProfileConfig {
  defaultMode: RunMode | null;
}

export interface RecentHandoffMetadata {
  cwd: string | null;
  startedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  transcriptExcerpt: string | null;
  stdoutSummary: string | null;
  stderrSummary: string | null;
  workSummary: string | null;
}

export interface CdxConfig {
  version: typeof CONFIG_SCHEMA_VERSION;
  defaultMode: RunMode | null;
  profiles: Record<string, ProfileConfig>;
  lowQuotaPreferredProfiles: string[];
  recentHandoffs: Record<string, RecentHandoffMetadata>;
}

export interface LoadConfigResult {
  path: string;
  exists: boolean;
  config: CdxConfig;
  warnings: string[];
}

export function createDefaultConfig(): CdxConfig {
  return {
    version: CONFIG_SCHEMA_VERSION,
    defaultMode: null,
    profiles: {},
    lowQuotaPreferredProfiles: [],
    recentHandoffs: {},
  };
}

export function getGlobalDefaultMode(config: CdxConfig): RunMode | null {
  return config.defaultMode;
}

export function getProfileDefaultMode(config: CdxConfig, profileId: string): RunMode | null {
  const normalizedProfileId = normalizeProfileId(profileId);
  if (!normalizedProfileId) {
    return null;
  }

  return config.profiles[normalizedProfileId]?.defaultMode ?? null;
}

export function resolveDefaultMode(config: CdxConfig, profileId: string | null | undefined): RunMode | null {
  if (profileId) {
    const profileDefaultMode = getProfileDefaultMode(config, profileId);
    if (profileDefaultMode) {
      return profileDefaultMode;
    }
  }

  return getGlobalDefaultMode(config);
}

export function setGlobalDefaultMode(config: CdxConfig, mode: RunMode | null): CdxConfig {
  return {
    ...cloneConfig(config),
    defaultMode: mode,
  };
}

export function setProfileDefaultMode(config: CdxConfig, profileId: string, mode: RunMode | null): CdxConfig {
  const normalizedProfileId = normalizeProfileId(profileId);
  const nextConfig = cloneConfig(config);

  if (!normalizedProfileId) {
    return nextConfig;
  }

  if (mode === null) {
    delete nextConfig.profiles[normalizedProfileId];
    return nextConfig;
  }

  nextConfig.profiles[normalizedProfileId] = { defaultMode: mode };
  return nextConfig;
}

export function getLowQuotaPreferredProfiles(config: CdxConfig): string[] {
  return [...config.lowQuotaPreferredProfiles];
}

export function setLowQuotaPreferredProfiles(config: CdxConfig, profileIds: readonly string[]): CdxConfig {
  return {
    ...cloneConfig(config),
    lowQuotaPreferredProfiles: normalizeProfileIdList(profileIds),
  };
}

export function rememberLowQuotaPreferredProfile(config: CdxConfig, profileId: string): CdxConfig {
  const normalizedProfileId = normalizeProfileId(profileId);
  if (!normalizedProfileId) {
    return cloneConfig(config);
  }

  return {
    ...cloneConfig(config),
    lowQuotaPreferredProfiles: normalizeProfileIdList([normalizedProfileId, ...config.lowQuotaPreferredProfiles]),
  };
}

export function sortProfilesByLowQuotaPreference(config: CdxConfig, profileIds: readonly string[]): string[] {
  const normalizedProfileIds = normalizeProfileIdList(profileIds);
  const preferenceOrder = new Map(config.lowQuotaPreferredProfiles.map((profileId, index) => [profileId, index]));

  return normalizedProfileIds
    .map((profileId, index) => ({
      profileId,
      index,
      preferenceIndex: preferenceOrder.get(profileId) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.preferenceIndex - right.preferenceIndex || left.index - right.index)
    .map((entry) => entry.profileId);
}

export function getRecentHandoff(config: CdxConfig, profileId: string): RecentHandoffMetadata | null {
  const normalizedProfileId = normalizeProfileId(profileId);
  if (!normalizedProfileId) {
    return null;
  }

  const handoff = config.recentHandoffs[normalizedProfileId];
  return handoff ? { ...handoff } : null;
}

export function setRecentHandoff(
  config: CdxConfig,
  profileId: string,
  handoff: RecentHandoffMetadata | null,
): CdxConfig {
  const normalizedProfileId = normalizeProfileId(profileId);
  const nextConfig = cloneConfig(config);

  if (!normalizedProfileId) {
    return nextConfig;
  }

  if (handoff === null) {
    delete nextConfig.recentHandoffs[normalizedProfileId];
    return nextConfig;
  }

  const normalizedHandoff = normalizeRecentHandoff(handoff);
  if (!hasRecentHandoffContent(normalizedHandoff)) {
    delete nextConfig.recentHandoffs[normalizedProfileId];
    return nextConfig;
  }

  nextConfig.recentHandoffs[normalizedProfileId] = normalizedHandoff;
  return nextConfig;
}

export function clearRecentHandoff(config: CdxConfig, profileId: string): CdxConfig {
  return setRecentHandoff(config, profileId, null);
}

export function removeProfileState(config: CdxConfig, profileId: string): CdxConfig {
  const normalizedProfileId = normalizeProfileId(profileId);
  const nextConfig = cloneConfig(config);

  if (!normalizedProfileId) {
    return nextConfig;
  }

  delete nextConfig.profiles[normalizedProfileId];
  delete nextConfig.recentHandoffs[normalizedProfileId];
  nextConfig.lowQuotaPreferredProfiles = nextConfig.lowQuotaPreferredProfiles.filter(
    (candidateProfileId) => candidateProfileId !== normalizedProfileId,
  );
  return nextConfig;
}

export async function loadConfig(configPath = getCdxConfigPath()): Promise<LoadConfigResult> {
  try {
    const rawConfig = await fsp.readFile(configPath, "utf8");
    return {
      path: configPath,
      exists: true,
      ...normalizeLoadedConfig(rawConfig),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        path: configPath,
        exists: false,
        config: createDefaultConfig(),
        warnings: [],
      };
    }

    return {
      path: configPath,
      exists: true,
      config: createDefaultConfig(),
      warnings: [formatReadError(error, configPath)],
    };
  }
}

export async function saveConfig(config: CdxConfig, configPath = getCdxConfigPath()): Promise<CdxConfig> {
  const normalizedConfig = sanitizeConfig(config);
  const directoryPath = path.dirname(configPath);
  const temporaryPath = path.join(directoryPath, `.${path.basename(configPath)}.${process.pid}.${Date.now()}.tmp`);

  await fsp.mkdir(directoryPath, { recursive: true });
  await fsp.writeFile(temporaryPath, `${JSON.stringify(normalizedConfig, null, 2)}\n`, "utf8");
  await fsp.rename(temporaryPath, configPath);

  return normalizedConfig;
}

function normalizeLoadedConfig(rawConfig: string): Pick<LoadConfigResult, "config" | "warnings"> {
  try {
    const parsed = JSON.parse(rawConfig) as unknown;
    return normalizeConfigShape(parsed);
  } catch {
    return {
      config: createDefaultConfig(),
      warnings: ["Config file is malformed JSON. Using defaults."],
    };
  }
}

function normalizeConfigShape(input: unknown): Pick<LoadConfigResult, "config" | "warnings"> {
  const warnings: string[] = [];
  const root = asRecord(input);
  if (!root) {
    return {
      config: createDefaultConfig(),
      warnings: ["Config file root must be a JSON object. Using defaults."],
    };
  }

  const config = createDefaultConfig();

  if ("version" in root && root.version !== CONFIG_SCHEMA_VERSION) {
    warnings.push(`Config version ${String(root.version)} is unsupported. Normalizing to version ${CONFIG_SCHEMA_VERSION}.`);
  }

  config.defaultMode = normalizeRunMode(root.defaultMode, warnings, "defaultMode");
  config.profiles = normalizeProfiles(root.profiles, warnings);
  config.lowQuotaPreferredProfiles = normalizeProfileArray(
    root.lowQuotaPreferredProfiles,
    warnings,
    "lowQuotaPreferredProfiles",
  );
  config.recentHandoffs = normalizeRecentHandoffs(root.recentHandoffs, warnings);

  return {
    config: sanitizeConfig(config),
    warnings,
  };
}

function normalizeProfiles(input: unknown, warnings: string[]): Record<string, ProfileConfig> {
  const profiles = asRecord(input);
  if (!profiles) {
    if (input !== undefined) {
      warnings.push("profiles must be an object. Ignoring invalid value.");
    }
    return {};
  }

  const normalizedProfiles: Record<string, ProfileConfig> = {};
  for (const [rawProfileId, rawProfileConfig] of Object.entries(profiles)) {
    const profileId = normalizeProfileId(rawProfileId);
    if (!profileId) {
      warnings.push("Ignoring profile config with an empty profile id.");
      continue;
    }

    const profileConfig = asRecord(rawProfileConfig);
    if (!profileConfig) {
      warnings.push(`profiles.${profileId} must be an object. Ignoring invalid value.`);
      continue;
    }

    const defaultMode = normalizeRunMode(profileConfig.defaultMode, warnings, `profiles.${profileId}.defaultMode`);
    if (defaultMode !== null) {
      normalizedProfiles[profileId] = { defaultMode };
    }
  }

  return normalizedProfiles;
}

function normalizeRecentHandoffs(input: unknown, warnings: string[]): Record<string, RecentHandoffMetadata> {
  const handoffs = asRecord(input);
  if (!handoffs) {
    if (input !== undefined) {
      warnings.push("recentHandoffs must be an object. Ignoring invalid value.");
    }
    return {};
  }

  const normalizedHandoffs: Record<string, RecentHandoffMetadata> = {};
  for (const [rawProfileId, rawHandoff] of Object.entries(handoffs)) {
    const profileId = normalizeProfileId(rawProfileId);
    if (!profileId) {
      warnings.push("Ignoring recent handoff with an empty profile id.");
      continue;
    }

    const handoff = asRecord(rawHandoff);
    if (!handoff) {
      warnings.push(`recentHandoffs.${profileId} must be an object. Ignoring invalid value.`);
      continue;
    }

    const normalizedHandoff = normalizeRecentHandoff(handoff, warnings, `recentHandoffs.${profileId}`);
    if (hasRecentHandoffContent(normalizedHandoff)) {
      normalizedHandoffs[profileId] = normalizedHandoff;
    }
  }

  return normalizedHandoffs;
}

function normalizeRecentHandoff(
  input: Partial<RecentHandoffMetadata> | Record<string, unknown>,
  warnings: string[] = [],
  fieldPrefix = "recentHandoff",
): RecentHandoffMetadata {
  return {
    cwd: normalizeStringField(input.cwd, warnings, `${fieldPrefix}.cwd`),
    startedAt: normalizeStringField(input.startedAt, warnings, `${fieldPrefix}.startedAt`),
    failedAt: normalizeStringField(input.failedAt, warnings, `${fieldPrefix}.failedAt`),
    failureReason: normalizeStringField(input.failureReason, warnings, `${fieldPrefix}.failureReason`),
    transcriptExcerpt: normalizeStringField(input.transcriptExcerpt, warnings, `${fieldPrefix}.transcriptExcerpt`),
    stdoutSummary: normalizeStringField(input.stdoutSummary, warnings, `${fieldPrefix}.stdoutSummary`),
    stderrSummary: normalizeStringField(input.stderrSummary, warnings, `${fieldPrefix}.stderrSummary`),
    workSummary: normalizeStringField(input.workSummary, warnings, `${fieldPrefix}.workSummary`),
  };
}

function normalizeStringField(input: unknown, warnings: string[], fieldName: string): string | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }

  if (typeof input !== "string") {
    warnings.push(`${fieldName} must be a string. Ignoring invalid value.`);
    return null;
  }

  return input;
}

function normalizeRunMode(input: unknown, warnings: string[], fieldName: string): RunMode | null {
  if (input === undefined || input === null) {
    return null;
  }

  if (!isRunMode(input)) {
    warnings.push(`${fieldName} must be one of ${RUN_MODES.join(", ")}. Ignoring invalid value.`);
    return null;
  }

  return input;
}

function normalizeProfileArray(input: unknown, warnings: string[], fieldName: string): string[] {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    warnings.push(`${fieldName} must be an array of profile ids. Ignoring invalid value.`);
    return [];
  }

  const invalidItems = input.length - input.filter((item) => typeof item === "string" && normalizeProfileId(item)).length;
  if (invalidItems > 0) {
    warnings.push(`${fieldName} contains invalid profile ids. Ignoring ${invalidItems} item${invalidItems === 1 ? "" : "s"}.`);
  }

  return normalizeProfileIdList(input.filter((item): item is string => typeof item === "string"));
}

function sanitizeConfig(config: CdxConfig): CdxConfig {
  const normalizedProfiles: Record<string, ProfileConfig> = {};
  for (const [profileId, profileConfig] of Object.entries(config.profiles)) {
    const normalizedProfileId = normalizeProfileId(profileId);
    const normalizedMode = isRunMode(profileConfig.defaultMode) ? profileConfig.defaultMode : null;
    if (normalizedProfileId && normalizedMode) {
      normalizedProfiles[normalizedProfileId] = { defaultMode: normalizedMode };
    }
  }

  const normalizedHandoffs: Record<string, RecentHandoffMetadata> = {};
  for (const [profileId, handoff] of Object.entries(config.recentHandoffs)) {
    const normalizedProfileId = normalizeProfileId(profileId);
    if (!normalizedProfileId) {
      continue;
    }

    const normalizedHandoff = normalizeRecentHandoff(handoff);
    if (hasRecentHandoffContent(normalizedHandoff)) {
      normalizedHandoffs[normalizedProfileId] = normalizedHandoff;
    }
  }

  return {
    version: CONFIG_SCHEMA_VERSION,
    defaultMode: isRunMode(config.defaultMode) ? config.defaultMode : null,
    profiles: normalizedProfiles,
    lowQuotaPreferredProfiles: normalizeProfileIdList(config.lowQuotaPreferredProfiles),
    recentHandoffs: normalizedHandoffs,
  };
}

function hasRecentHandoffContent(handoff: RecentHandoffMetadata): boolean {
  return Object.values(handoff).some((value) => value !== null);
}

function cloneConfig(config: CdxConfig): CdxConfig {
  return {
    version: CONFIG_SCHEMA_VERSION,
    defaultMode: isRunMode(config.defaultMode) ? config.defaultMode : null,
    profiles: Object.fromEntries(
      Object.entries(config.profiles).map(([profileId, profileConfig]) => [
        profileId,
        { defaultMode: isRunMode(profileConfig.defaultMode) ? profileConfig.defaultMode : null },
      ]),
    ),
    lowQuotaPreferredProfiles: [...config.lowQuotaPreferredProfiles],
    recentHandoffs: Object.fromEntries(
      Object.entries(config.recentHandoffs).map(([profileId, handoff]) => [profileId, { ...handoff }]),
    ),
  };
}

function normalizeProfileIdList(profileIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalizedProfileIds: string[] = [];

  for (const profileId of profileIds) {
    const normalizedProfileId = normalizeProfileId(profileId);
    if (!normalizedProfileId || seen.has(normalizedProfileId)) {
      continue;
    }

    seen.add(normalizedProfileId);
    normalizedProfileIds.push(normalizedProfileId);
  }

  return normalizedProfileIds;
}

function normalizeProfileId(profileId: string): string | null {
  const normalizedProfileId = profileId.trim();
  return normalizedProfileId ? normalizedProfileId : null;
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  return input as Record<string, unknown>;
}

function isRunMode(input: unknown): input is RunMode {
  return typeof input === "string" && RUN_MODES.includes(input as RunMode);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function formatReadError(error: unknown, configPath: string): string {
  if (error instanceof Error) {
    return `Failed to read ${configPath}: ${error.message}. Using defaults.`;
  }

  return `Failed to read ${configPath}. Using defaults.`;
}
