export type ViewId = "overview" | "profiles" | "usage" | "agents" | "doctor";

export interface DashboardProfile {
  id: string;
  account: string;
  plan: string | null;
  source: "modern" | "legacy";
  homePath: string;
  organization: string | null;
  accountId: string | null;
  lastRefresh: string | null;
  status: "healthy" | "warning" | "idle";
}

export interface DashboardUsageRow {
  profileId: string;
  account: string;
  plan: string | null;
  usageSource: "backend-api" | "status-scrape";
  fiveHourUsed: number | null;
  fiveHourLeft: number | null;
  fiveHourReset: string | null;
  weeklyUsed: number | null;
  weeklyLeft: number | null;
  weeklyReset: string | null;
  error: string | null;
}

export interface DashboardDoctorItem {
  title: string;
  severity: "good" | "warn" | "todo";
  detail: string;
  command: string;
}

export interface DashboardPayload {
  generatedAt: string;
  summary: {
    profileCount: number;
    connectedCount: number;
    liveUsageCount: number;
    missingAuthCount: number;
    highestUsageProfile: string | null;
  };
  profiles: DashboardProfile[];
  usage: DashboardUsageRow[];
  agents: {
    projectRoot: string;
    globalPath: string;
    globalExists: boolean;
    projectAgentsPath: string;
    projectState: "missing" | "global-link" | "local-file" | "other-link";
    linkedTarget: string | null;
  };
  doctor: DashboardDoctorItem[];
}

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

export interface DoctorReport {
  generatedAt: string;
  doctor: DashboardDoctorItem[];
}

export interface PreparedAgentsFile {
  filePath: string;
  status: DashboardPayload["agents"];
}

export const quickCommands = [
  {
    command: "cdx run",
    description: "Open the profile picker for users who do not want to remember IDs.",
  },
  {
    command: "cdx run work",
    description: "Launch Codex immediately with the work profile's CODEX_HOME.",
  },
  {
    command: "cdx usage",
    description: "Read OpenAI usage windows for every connected profile in one table.",
  },
  {
    command: "cdx agents edit --global",
    description: "Edit the shared AGENTS rules once and reuse them across projects.",
  },
  {
    command: "cdx doctor",
    description: "Show what is misconfigured before the user has to debug it manually.",
  },
];
