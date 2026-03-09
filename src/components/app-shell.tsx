import type { ReactNode } from "react";
import type { DashboardPayload, ViewId } from "../data";

interface AppShellProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  onOpenRunPicker: () => void;
  onToggleTheme: () => void;
  themeLabel: string;
  summary: DashboardPayload["summary"] | null;
  lastUpdated: string | null;
  loading: boolean;
  onRefresh: () => void;
  children: ReactNode;
}

const navItems: Array<{ id: ViewId; label: string; caption: string }> = [
  { id: "overview", label: "Overview", caption: "start here" },
  { id: "profiles", label: "Profiles", caption: "accounts" },
  { id: "usage", label: "Usage", caption: "limits" },
  { id: "agents", label: "AGENTS", caption: "shared rules" },
  { id: "doctor", label: "Doctor", caption: "fix issues" },
];

export function AppShell({
  activeView,
  onViewChange,
  onOpenRunPicker,
  onToggleTheme,
  themeLabel,
  summary,
  lastUpdated,
  loading,
  onRefresh,
  children,
}: AppShellProps) {
  const connectedLabel = summary ? `${summary.connectedCount} profiles connected` : "Loading profiles";
  const usageLabel = summary
    ? `${summary.liveUsageCount}/${summary.profileCount} live usage ready`
    : "Fetching OpenAI usage";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">cdx</div>
          <div>
            <p className="eyebrow">Codex Switchboard</p>
            <h1>Multi-account control</h1>
          </div>
        </div>

        <div className="sidebar-stack">
          <nav className="nav-list" aria-label="Primary">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-button ${activeView === item.id ? "is-active" : ""}`}
                onClick={() => onViewChange(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.caption}</small>
              </button>
            ))}
          </nav>

          <div className="sidebar-panel">
            <p className="panel-label">Why cdx</p>
            <ul className="sidebar-bullets">
              <li>One shared Codex install</li>
              <li>Separate `CODEX_HOME` per profile</li>
              <li>Global `AGENTS.md` without copy-paste</li>
              <li>All account usage in one place</li>
            </ul>
          </div>

          <div className="sidebar-actions">
            <button className="primary-button" onClick={onOpenRunPicker}>
              Open Run Picker
            </button>
            <button className="ghost-button" onClick={onToggleTheme}>
              Theme: {themeLabel}
            </button>
            <button className="ghost-button" onClick={onRefresh} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh live data"}
            </button>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">CCS-inspired dashboard</p>
            <h2>Built for users who do not want to memorize commands</h2>
          </div>

          <div className="topbar-actions">
            <div className="status-pill">
              <span className="status-dot" />
              {connectedLabel}
            </div>
            <div className="status-pill warm">{usageLabel}</div>
            {lastUpdated ? <div className="status-pill">Updated {new Date(lastUpdated).toLocaleTimeString()}</div> : null}
          </div>
        </header>

        <main className="content-grid">{children}</main>
      </div>
    </div>
  );
}
