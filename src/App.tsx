import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AppShell } from "./components/app-shell";
import {
  AgentsPanel,
  DoctorPanel,
  OverviewPanel,
  ProfilesPanel,
  UsagePanel,
} from "./components/panels";
import { RunPickerModal } from "./components/run-picker-modal";
import {
  createProfile,
  fetchActionSession,
  fetchDashboard,
  fetchDoctorReport,
  prepareGlobalAgentsFile,
  startLoginSession,
  startLogoutSession,
  startRunSession,
} from "./lib/dashboard-client";
import type { ActionSession, DashboardPayload, DoctorReport, ViewId } from "./data";

const STORAGE_KEY = "cdx-theme";

function App() {
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [runPickerOpen, setRunPickerOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ActionSession | null>(null);
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme = saved === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const loadDashboard = useEffectEvent(async () => {
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
  });

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;
    void loadDashboard();
  }, [loadDashboard]);

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

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  const handleCreateProfile = async () => {
    const profileId = window.prompt("Create profile name");
    if (!profileId) {
      return;
    }

    try {
      const created = await createProfile(profileId);
      setActionMessage(`Created profile ${created.id}`);
      await loadDashboard();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Profile creation failed");
    }
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

  const handleRefreshDoctor = async () => {
    try {
      const report = await fetchDoctorReport();
      setDoctorReport(report);
      setActionMessage(`Doctor refreshed at ${new Date(report.generatedAt).toLocaleTimeString()}`);
      await loadDashboard();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Failed to refresh doctor report");
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
        onToggleTheme={toggleTheme}
        themeLabel={theme}
        summary={dashboard?.summary ?? null}
        lastUpdated={dashboard?.generatedAt ?? null}
        loading={showLoadingState}
        onRefresh={() => void loadDashboard()}
      >
        {activeView === "overview" && (
          <OverviewPanel
            dashboard={dashboard}
            loading={showLoadingState}
            error={loadError}
            onOpenRunPicker={() => setRunPickerOpen(true)}
            onRefresh={() => void loadDashboard()}
          />
        )}
        {activeView === "profiles" && (
          <ProfilesPanel
            dashboard={dashboard}
            loading={showLoadingState}
            error={loadError}
            onCreateProfile={handleCreateProfile}
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
        {activeView === "doctor" && (
          <DoctorPanel
            dashboard={dashboard}
            loading={showLoadingState}
            error={loadError}
            report={doctorReport}
            onRefreshDoctor={handleRefreshDoctor}
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

      {actionMessage ? <div className="action-banner">{actionMessage}</div> : null}
    </>
  );
}

export default App;
