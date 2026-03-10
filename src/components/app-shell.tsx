import type { ReactNode } from "react";
import type { DashboardPayload, ViewId } from "../data";
import { themeOptions, type ThemeId } from "../theme";

interface AppShellProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  onOpenRunPicker: () => void;
  activeTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  summary: DashboardPayload["summary"] | null;
  lastUpdated: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}

const navItems: Array<{ id: ViewId; label: string; caption: string }> = [
  { id: "overview", label: "Overview", caption: "Launch" },
  { id: "profiles", label: "Profiles", caption: "Homes" },
  { id: "usage", label: "Usage", caption: "Quota" },
  { id: "agents", label: "AGENTS", caption: "Rules" },
];

export function AppShell({
  activeView,
  onViewChange,
  onOpenRunPicker,
  activeTheme,
  onThemeChange,
  summary,
  lastUpdated,
  refreshing,
  onRefresh,
  children,
}: AppShellProps) {
  const connectedLabel = summary ? `${summary.connectedCount} connected` : "Profiles loading";
  const usageLabel = summary
    ? `${summary.liveUsageCount}/${summary.profileCount} usage live`
    : "Usage loading";
  const missingLabel = summary ? `${summary.missingAuthCount} need login` : "Auth loading";
  const updatedLabel = lastUpdated
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(lastUpdated))
    : "Waiting";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="shell-header surface-panel">
        <div className="shell-header__top">
          <div className="brand-lockup">
            <div className="brand-mark">cdx</div>
            <div>
              <p className="eyebrow">Codex switchboard</p>
              <h1>Switch clean. Run fast.</h1>
            </div>
          </div>

          <div className="shell-actions">
            <button className="primary-button" onClick={onOpenRunPicker}>
              Open Run Picker
            </button>
            <button className="ghost-button" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="shell-header__bottom">
          <nav className="nav-strip" aria-label="Primary">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-button ${activeView === item.id ? "is-active" : ""}`}
                onClick={() => onViewChange(item.id)}
                type="button"
              >
                <span>{item.label}</span>
                <small>{item.caption}</small>
              </button>
            ))}
          </nav>

          <div className="theme-switcher" role="group" aria-label="Theme">
            {themeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`theme-button ${activeTheme === option.id ? "is-active" : ""}`}
                onClick={() => onThemeChange(option.id)}
                aria-pressed={activeTheme === option.id}
              >
                <span>{option.label}</span>
                <small>{option.shortLabel}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="status-rail" aria-label="Status">
          <div className="status-pill">
            <span className="status-dot" />
            {connectedLabel}
          </div>
          <div className="status-pill warm">{usageLabel}</div>
          <div className="status-pill">{missingLabel}</div>
          <div className="status-pill subtle">Updated {updatedLabel}</div>
        </div>
      </header>

      <div className="main-shell">
        <main id="main-content" className="content-grid">
          {children}
        </main>
      </div>
    </div>
  );
}
