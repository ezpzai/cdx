import {
  quickCommands,
  type ActionSession,
  type DashboardPayload,
  type DashboardProfile,
  type DashboardUsageRow,
} from "../data";

function Meter({ value, tone = "default" }: { value: number; tone?: "default" | "warn" }) {
  return (
    <div className="meter" aria-hidden="true">
      <div
        className={`meter-fill ${tone === "warn" ? "is-warn" : ""}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function PanelState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return <p className="muted-copy">Fetching live account data…</p>;
  }

  if (error) {
    return <p className="muted-copy">Dashboard error: {error}</p>;
  }

  return null;
}

function formatDate(value: string | null, fallback = "Unknown"): string {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatPercent(value: number | null): string {
  return typeof value === "number" ? `${value}%` : "--";
}

function getHottestRow(usage: DashboardUsageRow[]): DashboardUsageRow | null {
  const rows = usage.filter((row) => typeof row.fiveHourUsed === "number");
  if (rows.length === 0) {
    return null;
  }

  return rows.sort((left, right) => (right.fiveHourUsed ?? 0) - (left.fiveHourUsed ?? 0))[0];
}

function getStatusLabel(profile: DashboardProfile["status"]): string {
  if (profile === "healthy") {
    return "Healthy";
  }

  if (profile === "warning") {
    return "Needs login";
  }

  return "Idle";
}

interface PanelProps {
  dashboard: DashboardPayload | null;
  loading: boolean;
  error: string | null;
}

function isProfileSessionActive(activeSession: ActionSession | null, profileId: string, type?: ActionSession["type"]): boolean {
  if (!activeSession || activeSession.finishedAt || activeSession.profileId !== profileId) {
    return false;
  }

  return type ? activeSession.type === type : true;
}

export function OverviewPanel({
  dashboard,
  loading,
  error,
  onOpenRunPicker,
}: PanelProps & { onOpenRunPicker: () => void }) {
  const profiles = dashboard?.profiles ?? [];
  const hottest = getHottestRow(dashboard?.usage ?? []);
  const featuredProfiles = profiles.slice(0, 3);

  return (
    <>
      <section className="hero-card hero-card--overview section-card section-card--wide">
        <div className="hero-copy">
          <p className="eyebrow">Launch surface</p>
          <h2>Pick the right profile and go.</h2>
          <p className="hero-description">One shared Codex install. Separate homes. Clean handoff.</p>
          <div className="button-row">
            <button className="primary-button" onClick={onOpenRunPicker}>
              Launch with Picker
            </button>
          </div>
          <PanelState loading={loading} error={error} />
        </div>

        <div className="hero-metrics">
          <StatCard
            label="Profiles"
            value={dashboard ? String(dashboard.summary.profileCount) : "--"}
            detail={dashboard ? `${dashboard.summary.connectedCount} ready` : "Scanning"}
          />
          <StatCard
            label="Usage Live"
            value={dashboard ? `${dashboard.summary.liveUsageCount}` : "--"}
            detail="Accounts reporting"
          />
          <StatCard
            label="AGENTS"
            value={dashboard?.agents.globalExists ? "Ready" : "Missing"}
            detail="Shared rule source"
          />
          <StatCard
            label="Hot Profile"
            value={dashboard?.summary.highestUsageProfile || "None"}
            detail="Highest 5h load"
          />
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Ready now</p>
            <h3>Profiles</h3>
          </div>
        </div>
        {featuredProfiles.length > 0 ? (
          <div className="stack-list">
            {featuredProfiles.map((profile) => (
              <article key={profile.id} className="stack-card">
                <div>
                  <strong>{profile.id}</strong>
                  <p>{profile.account}</p>
                </div>
                <span className={`status-tag is-${profile.status}`}>{getStatusLabel(profile.status)}</span>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No profiles yet.</p>
        )}
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Pressure</p>
            <h3>Usage pulse</h3>
          </div>
        </div>
        {hottest ? (
          <article className="spotlight-card">
            <strong>{hottest.profileId}</strong>
            <p>{hottest.account}</p>
            <span>{formatPercent(hottest.fiveHourUsed)} used in the active 5h window.</span>
          </article>
        ) : (
          <p className="muted-copy">No live usage rows yet.</p>
        )}
      </section>

      <section className="section-card section-card--wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Quick commands</p>
            <h3>Fast paths</h3>
          </div>
        </div>
        <div className="command-list command-list--compact">
          {quickCommands.map((item) => (
            <article key={item.command} className="command-card">
              <code>{item.command}</code>
              <p>
                {item.command === "cdx run"
                  ? "Open picker"
                  : item.command === "cdx run work"
                    ? "Launch one profile"
                    : item.command === "cdx usage"
                      ? "Open usage table"
                      : "Edit global rules"}
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function ProfilesPanel({
  dashboard,
  loading,
  error,
  onLoginProfile,
  onLogoutProfile,
  activeSession,
}: PanelProps & {
  onLoginProfile: (profileId: string) => void | Promise<void>;
  onLogoutProfile: (profileId: string) => void | Promise<void>;
  activeSession: ActionSession | null;
}) {
  const profiles = dashboard?.profiles ?? [];

  return (
    <>
      <section className="section-card section-card--wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Profiles</p>
            <h3>Independent homes</h3>
          </div>
        </div>

        <PanelState loading={loading} error={error} />

        {profiles.length > 0 ? (
          <div className="profile-grid">
            {profiles.map((profile) => (
              <article key={profile.id} className="profile-card">
                <div className="profile-card__header">
                  <div>
                    <h4>{profile.id}</h4>
                    <p>{profile.account}</p>
                  </div>
                  <span className={`status-tag is-${profile.status}`}>{getStatusLabel(profile.status)}</span>
                </div>

                <dl className="profile-meta">
                  <div>
                    <dt>Plan</dt>
                    <dd>{profile.plan || "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Org</dt>
                    <dd>{profile.organization || "Personal"}</dd>
                  </div>
                  <div>
                    <dt>Refresh</dt>
                    <dd>{formatDate(profile.lastRefresh)}</dd>
                  </div>
                  <div>
                    <dt>Path</dt>
                    <dd>{profile.homePath}</dd>
                  </div>
                </dl>

                <div className="button-row button-row--tight">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void onLoginProfile(profile.id)}
                    disabled={isProfileSessionActive(activeSession, profile.id, "login")}
                  >
                    {isProfileSessionActive(activeSession, profile.id, "login") ? "Login starting…" : "Login"}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void onLogoutProfile(profile.id)}
                    disabled={isProfileSessionActive(activeSession, profile.id, "logout")}
                  >
                    {isProfileSessionActive(activeSession, profile.id, "logout") ? "Logout running…" : "Logout"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No profiles found.</p>
        )}
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Setup</p>
            <h3>First login</h3>
          </div>
        </div>
        <div className="compact-steps">
          <article className="stack-card">
            <strong>1</strong>
            <p>`cdx login work`</p>
          </article>
          <article className="stack-card">
            <strong>2</strong>
            <p>Finish auth once</p>
          </article>
          <article className="stack-card">
            <strong>3</strong>
            <p>Use `cdx run` after that</p>
          </article>
        </div>
      </section>
    </>
  );
}

export function UsagePanel({ dashboard, loading, error }: PanelProps) {
  const usage = dashboard?.usage ?? [];
  const hottest = getHottestRow(usage);

  return (
    <>
      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Usage</p>
            <h3>Live quota</h3>
          </div>
        </div>
        <PanelState loading={loading} error={error} />
        {hottest ? (
          <article className="spotlight-card">
            <strong>{hottest.profileId}</strong>
            <p>{hottest.account}</p>
            <span>{formatPercent(hottest.fiveHourUsed)} in the current 5h window.</span>
          </article>
        ) : (
          <p className="muted-copy">No live usage rows yet.</p>
        )}
      </section>

      <section className="section-card section-card--wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Window status</p>
            <h3>Per profile</h3>
          </div>
        </div>
        {usage.length > 0 ? (
          <div className="usage-table">
            <div className="usage-table__head">
              <span>Profile</span>
              <span>Plan</span>
              <span>5h</span>
              <span>Week</span>
            </div>
            {usage.map((row) => (
              <div key={row.profileId} className={`usage-table__row ${row.error ? "is-error" : ""}`}>
                <div>
                  <strong>{row.profileId}</strong>
                  <p>{row.account}</p>
                </div>
                <div>
                  <strong>{row.plan || "Unknown"}</strong>
                  <p>{row.error ? "Needs login" : row.usageSource === "status-scrape" ? "Fallback" : "Backend"}</p>
                </div>
                <div>
                  {row.error ? (
                    <p className="usage-error">{row.error}</p>
                  ) : (
                    <>
                      <strong>{formatPercent(row.fiveHourUsed)}</strong>
                      <Meter value={row.fiveHourUsed ?? 0} tone={(row.fiveHourUsed ?? 0) > 75 ? "warn" : "default"} />
                      <p>Reset {formatDate(row.fiveHourReset)}</p>
                    </>
                  )}
                </div>
                <div>
                  {row.error ? (
                    <p className="usage-error">Re-auth to resume tracking.</p>
                  ) : (
                    <>
                      <strong>{formatPercent(row.weeklyUsed)}</strong>
                      <Meter value={row.weeklyUsed ?? 0} tone={(row.weeklyUsed ?? 0) > 60 ? "warn" : "default"} />
                      <p>Reset {formatDate(row.weeklyReset)}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No usage data yet.</p>
        )}
      </section>
    </>
  );
}

export function AgentsPanel({
  dashboard,
  loading,
  error,
  onPrepareGlobalAgentsFile,
}: PanelProps & {
  onPrepareGlobalAgentsFile: () => void | Promise<void>;
}) {
  const agents = dashboard?.agents ?? null;

  return (
    <>
      <section className="hero-card section-card section-card--wide hero-card--agents">
        <div className="hero-copy">
          <p className="eyebrow">Shared rules</p>
          <h2>One AGENTS source. Predictable launches.</h2>
          <p className="hero-description">Keep the global file ready and let each repo bind to it when needed.</p>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={onPrepareGlobalAgentsFile}>
              Prepare Global AGENTS
            </button>
          </div>
          <PanelState loading={loading} error={error} />
        </div>

        <div className="hero-metrics">
          <StatCard label="Global" value={agents?.globalExists ? "Ready" : "Missing"} detail="Shared rule file" />
          <StatCard
            label="Repo"
            value={
              agents?.projectState === "global-link"
                ? "Linked"
                : agents?.projectState === "local-file"
                  ? "Local"
                  : agents?.projectState === "other-link"
                    ? "Other"
                    : "Missing"
            }
            detail="Current repo state"
          />
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Global file</p>
            <h3>Source path</h3>
          </div>
        </div>
        <article className="binding-row">
          <div>
            <strong>Location</strong>
            <p>{agents?.globalPath || "~/.cdx/AGENTS.md"}</p>
          </div>
        </article>
      </section>

      <section className="section-card section-card--wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Repository binding</p>
            <h3>Current project</h3>
          </div>
        </div>
        {agents ? (
          <div className="binding-list">
            <article className="binding-row">
              <div>
                <strong>Project root</strong>
                <p>{agents.projectRoot}</p>
              </div>
              <div>
                <strong>AGENTS path</strong>
                <p>{agents.projectAgentsPath}</p>
              </div>
              <div>
                <span
                  className={`status-tag ${
                    agents.projectState === "global-link"
                      ? "is-healthy"
                      : agents.projectState === "local-file"
                        ? "is-warning"
                        : "is-idle"
                  }`}
                >
                  {agents.projectState === "global-link"
                    ? "Global link"
                    : agents.projectState === "local-file"
                      ? "Local file"
                      : agents.projectState === "other-link"
                        ? "Other link"
                        : "Missing"}
                </span>
              </div>
            </article>
            {agents.linkedTarget ? (
              <article className="binding-row">
                <div>
                  <strong>Linked target</strong>
                  <p>{agents.linkedTarget}</p>
                </div>
              </article>
            ) : null}
          </div>
        ) : (
          <p className="muted-copy">AGENTS status not available yet.</p>
        )}
      </section>
    </>
  );
}
