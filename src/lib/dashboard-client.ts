import type { ActionSession, DashboardPayload, DoctorReport, PreparedAgentsFile } from "../data";

interface ApiErrorShape {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface ApiSuccessShape<T> {
  ok: true;
  data: T;
}

async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json()) as ApiSuccessShape<T> | ApiErrorShape | T;

  if (!response.ok) {
    if (typeof payload === "object" && payload !== null && "ok" in payload && payload.ok === false) {
      throw new Error(payload.error.message);
    }
    throw new Error(`Request failed with ${response.status}`);
  }

  if (typeof payload === "object" && payload !== null && "ok" in payload && payload.ok === true) {
    return payload.data;
  }

  return payload as T;
}

export async function fetchDashboard(): Promise<DashboardPayload> {
  return apiRequest<DashboardPayload>("/api/dashboard");
}

export async function createProfile(profileId: string): Promise<{ id: string; homePath: string }> {
  return apiRequest("/api/profiles", {
    method: "POST",
    body: JSON.stringify({ profileId }),
  });
}

export async function startRunSession(profileId: string): Promise<ActionSession> {
  return apiRequest("/api/run-sessions", {
    method: "POST",
    body: JSON.stringify({ profileId }),
  });
}

export async function startLoginSession(profileId: string): Promise<ActionSession> {
  return apiRequest("/api/login-sessions", {
    method: "POST",
    body: JSON.stringify({ profileId }),
  });
}

export async function startLogoutSession(profileId: string): Promise<ActionSession> {
  return apiRequest(`/api/profiles/${encodeURIComponent(profileId)}/logout`, {
    method: "POST",
  });
}

export async function fetchActionSession(sessionId: string): Promise<ActionSession> {
  return apiRequest(`/api/action-sessions/${encodeURIComponent(sessionId)}`);
}

export async function fetchDoctorReport(): Promise<DoctorReport> {
  return apiRequest("/api/doctor");
}

export async function prepareGlobalAgentsFile(): Promise<PreparedAgentsFile> {
  return apiRequest("/api/agents/global-file", {
    method: "POST",
  });
}
