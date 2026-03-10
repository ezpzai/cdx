import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./components/app-shell";
import { AgentsPanel, OverviewPanel, ProfilesPanel, UsagePanel } from "./components/panels";
import { RunPickerModal } from "./components/run-picker-modal";
import {
  fetchActionSession,
  fetchDashboard,
  prepareGlobalAgentsFile,
  startLoginSession,
  startLogoutSession,
  startRunSession,
} from "./lib/dashboard-client";
import type { ActionSession, DashboardPayload, ViewId } from "./data";
import { isThemeId, themeOptions, type ThemeId } from "./theme";

const STORAGE_KEY = "cdx-theme";
const VIEW_QUERY_KEY = "view";

function isViewId(value: string | null): value is ViewId {
  return value === "overview" || value === "profiles" || value === "usage" || value === "agents";
}

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const themeOption = themeOptions.find((option) => option.id === theme);
  if (metaTheme && themeOption) {
    metaTheme.setAttribute("content", themeOption.metaColor);
  }
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [runPickerOpen, setRunPickerOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("sepia");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ActionSession | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get(VIEW_QUERY_KEY);
    if (isViewId(requestedView)) {
      setActiveView(requestedView);
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme = isThemeId(saved) ? saved : "sepia";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedView = params.get(VIEW_QUERY_KEY);
      if (isViewId(requestedView)) {
        setActiveView(requestedView);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const next = await fetchDashboard();
      setDashboard(next);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unknown dashboard error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(VIEW_QUERY_KEY, activeView);
    window.history.replaceState({}, "", nextUrl);
  }, [activeView]);

  const showLoadingState = loading && dashboard === null;

  useEffect(() => {
    if (!activeSession || activeSession.finishedAt) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const next = await fetchActionSession(activeSession.id);
        setActiveSession(next);
        if (next.finishedAt) {
          setActionMessage(next.message);
          void loadDashboard();
        }
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : "Unknown action session error");
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [activeSession, loadDashboard]);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }

    const timer = window.setTimeout(() => setActionMessage(null), 4200);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const handleThemeChange = (nextTheme: ThemeId) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  const handleRunProfile = async (profileId: string) => {
    try {
      const session = await startRunSession(profileId);
      setActiveSession(session);
      setActionMessage(session.message);
      setRunPickerOpen(false);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Failed to start run session");
    }
  };

  const handleLoginProfile = async (profileId: string) => {
    try {
      const session = await startLoginSession(profileId);
      setActiveSession(session);
      setActionMessage(session.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Failed to start login session");
    }
  };

  const handleLogoutProfile = async (profileId: string) => {
    try {
      const session = await startLogoutSession(profileId);
      setActiveSession(session);
      setActionMessage(session.message);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Failed to start logout session");
    }
  };

  const handlePrepareAgentsFile = async () => {
    try {
      const prepared = await prepareGlobalAgentsFile();
      setActionMessage(`Global AGENTS ready at ${prepared.filePath}`);
      await loadDashboard();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Failed to prepare AGENTS file");
    }
  };

  return (
    <>
      <AppShell
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenRunPicker={() => setRunPickerOpen(true)}
        activeTheme={theme}
        onThemeChange={handleThemeChange}
        summary={dashboard?.summary ?? null}
        lastUpdated={dashboard?.generatedAt ?? null}
        refreshing={loading}
        onRefresh={() => void loadDashboard()}
      >
        {activeView === "overview" && (
          <OverviewPanel
            dashboard={dashboard}
            loading={showLoadingState}
            error={loadError}
            onOpenRunPicker={() => setRunPickerOpen(true)}
          />
        )}
        {activeView === "profiles" && (
          <ProfilesPanel
            dashboard={dashboard}
            loading={showLoadingState}
            error={loadError}
            onLoginProfile={handleLoginProfile}
            onLogoutProfile={handleLogoutProfile}
            activeSession={activeSession}
          />
        )}
        {activeView === "usage" && <UsagePanel dashboard={dashboard} loading={showLoadingState} error={loadError} />}
        {activeView === "agents" && (
          <AgentsPanel
            dashboard={dashboard}
            loading={showLoadingState}
            error={loadError}
            onPrepareGlobalAgentsFile={handlePrepareAgentsFile}
          />
        )}
      </AppShell>

      <RunPickerModal
        open={runPickerOpen}
        onClose={() => setRunPickerOpen(false)}
        profiles={dashboard?.profiles ?? []}
        loading={showLoadingState}
        onRunProfile={handleRunProfile}
        activeSession={activeSession}
      />

      {actionMessage ? (
        <div className="action-banner" aria-live="polite">
          {actionMessage}
        </div>
      ) : null}
    </>
  );
}

export default App;
