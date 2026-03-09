import {
  quickCommands,
  type ActionSession,
  type DashboardPayload,
  type DashboardUsageRow,
  type DoctorReport,
} from "../data";

function Meter({ value, tone = "default" }: { value: number; tone?: "default" | "warn" }) {
  return (
    <div className="meter">
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
    return <p className="muted-copy">Fetching live Codex account data...</p>;
  }

  if (error) {
    return <p className="muted-copy">Dashboard error: {error}</p>;
  }

  return null;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}

function getHottestRow(usage: DashboardUsageRow[]): DashboardUsageRow | null {
  const rows = usage.filter((row) => typeof row.fiveHourUsed === "number");
  if (rows.length === 0) {
    return null;
  }

  return rows.sort((left, right) => (right.fiveHourUsed ?? 0) - (left.fiveHourUsed ?? 0))[0];
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
  onRefresh,
}: PanelProps & { onOpenRunPicker: () => void; onRefresh: () => void }) {
  return (
    <>
      <section className="hero-card section-card">
        <div className="hero-copy">
          <p className="eyebrow">Command center</p>
          <h3>Make `cdx run` the safe default for everyone</h3>
          <p className="hero-description">
            `cdx run` opens a profile picker, shows the connected account behind each profile, and
            launches the shared npm-installed Codex CLI with the right `CODEX_HOME`.
          </p>
          <div className="button-row">
            <button className="primary-button" onClick={onOpenRunPicker}>
              Preview run picker
            </button>
            <button className="ghost-button" onClick={onRefresh}>
              Refresh live dashboard
            </button>
          </div>
          <PanelState loading={loading} error={error} />
        </div>

        <div className="hero-metrics">
          <StatCard
            label="Profiles"
            value={dashboard ? String(dashboard.summary.profileCount) : "--"}
            detail={dashboard ? `${dashboard.summary.connectedCount} ready to launch` : "waiting for scan"}
          />
          <StatCard
            label="Global AGENTS"
            value={dashboard?.agents.globalExists ? "Ready" : "Missing"}
            detail="`~/.cdx/AGENTS.md`"
          />
          <StatCard
            label="OpenAI usage"
            value={
              dashboard
                ? `${dashboard.summary.liveUsageCount}/${dashboard.summary.profileCount}`
                : "--/--"
            }
            detail="queried from ChatGPT backend"
          />
          <StatCard
            label="At risk"
            value={dashboard?.summary.highestUsageProfile || "None"}
            detail="highest 5h usage right now"
          />
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Core flow</p>
            <h3>What cdx actually does</h3>
          </div>
        </div>
        <div className="flow-grid">
          <article className="flow-step">
            <span>01</span>
            <h4>Pick a profile</h4>
            <p>`cdx run` opens a human-friendly list instead of forcing the user to remember IDs.</p>
          </article>
          <article className="flow-step">
            <span>02</span>
            <h4>Mount AGENTS rules</h4>
            <p>cdx ensures the project sees the shared `AGENTS.md` before Codex launches.</p>
          </article>
          <article className="flow-step">
            <span>03</span>
            <h4>Reuse installed Codex</h4>
            <p>All profiles share the same npm-installed `codex` binary. Only `CODEX_HOME` changes.</p>
          </article>
          <article className="flow-step">
            <span>04</span>
            <h4>Read live usage</h4>
            <p>`cdx usage` reads the same OpenAI quota windows that Codex exposes in `/status`.</p>
          </article>
        </div>
      </section>

      <section className="section-card section-card--wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Starter commands</p>
            <h3>Friendly entry points</h3>
          </div>
        </div>
        <div className="command-list">
          {quickCommands.map((item) => (
            <article key={item.command} className="command-card">
              <code>{item.command}</code>
              <p>{item.description}</p>
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
  onCreateProfile,
  onLoginProfile,
  onLogoutProfile,
  activeSession,
}: PanelProps & {
  onCreateProfile: () => void | Promise<void>;
  onLoginProfile: (profileId: string) => void | Promise<void>;
  onLogoutProfile: (profileId: string) => void | Promise<void>;
  activeSession: ActionSession | null;
}) {
  return (
    <>
      <section className="section-card section-card--wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Profiles</p>
            <h3>Independent Codex homes</h3>
          </div>
          <button className="ghost-button" type="button" onClick={onCreateProfile}>
            Create profile
          </button>
        </div>

        <PanelState loading={loading} error={error} />

        <div className="profile-grid">
          {(dashboard?.profiles ?? []).map((profile) => (
            <article key={profile.id} className="profile-card">
              <div className="button-row">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void onLoginProfile(profile.id)}
                  disabled={isProfileSessionActive(activeSession, profile.id, "login")}
                >
                  {isProfileSessionActive(activeSession, profile.id, "login") ? "Login starting..." : "Login"}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void onLogoutProfile(profile.id)}
                  disabled={isProfileSessionActive(activeSession, profile.id, "logout")}
                >
                  {isProfileSessionActive(activeSession, profile.id, "logout") ? "Logout running..." : "Logout"}
                </button>
              </div>
              <div className="profile-card__header">
                <div>
                  <h4>{profile.id}</h4>
                  <p>{profile.account}</p>
                </div>
                <span className={`status-tag is-${profile.status}`}>
                  {profile.status === "healthy"
                    ? "Healthy"
                    : profile.status === "warning"
                      ? "Needs attention"
                      : "Idle"}
                </span>
              </div>

              <dl className="profile-meta">
                <div>
                  <dt>Plan</dt>
                  <dd>{profile.plan || "unknown"}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{profile.homePath}</dd>
                </div>
                <div>
                  <dt>Auth refresh</dt>
                  <dd>{formatDate(profile.lastRefresh)}</dd>
                </div>
              </dl>

              <p className="profile-note">
                {profile.organization ? `${profile.organization} org` : "No org metadata"} · {profile.source} profile
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Onboarding</p>
            <h3>Non-technical user path</h3>
          </div>
        </div>
        <ol className="plain-steps">
          <li>Create a profile once with `cdx create work`.</li>
          <li>Log in once with `cdx login work`.</li>
          <li>Tell the user to run `cdx run` from then on.</li>
        </ol>
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
            <p className="eyebrow">OpenAI usage</p>
            <h3>Live usage from the ChatGPT backend</h3>
          </div>
        </div>
        <p className="muted-copy">
          This screen uses the same account token and account ID that Codex stores in `auth.json`,
          then queries the backend usage window directly instead of relying on the bottom status bar.
        </p>
        <PanelState loading={loading} error={error} />
      </section>

      <section className="section-card section-card--wide">
        <div className="usage-table">
          <div className="usage-table__head">
            <span>Profile</span>
            <span>Plan</span>
            <span>5h window</span>
            <span>Weekly</span>
          </div>
          {usage.map((row) => (
            <div key={row.profileId} className={`usage-table__row ${row.error ? "is-error" : ""}`}>
              <div>
                <strong>{row.profileId}</strong>
                <p>{row.account}</p>
              </div>
              <div>
                <strong>{row.plan || "unknown"}</strong>
                <p>
                  {row.error
                    ? "Needs login refresh"
                    : row.usageSource === "status-scrape"
                      ? "Fetched from Codex /status fallback"
                      : "Fetched from backend-api/wham/usage"}
                </p>
              </div>
              <div>
                {row.error ? (
                  <p className="usage-error">{row.error}</p>
                ) : (
                  <>
                    <strong>{row.fiveHourUsed}% used</strong>
                    <Meter value={row.fiveHourUsed ?? 0} tone={(row.fiveHourUsed ?? 0) > 75 ? "warn" : "default"} />
                    <p>Reset {formatDate(row.fiveHourReset)}</p>
                  </>
                )}
              </div>
              <div>
                {row.error ? (
                  <p className="usage-error">Re-authenticate this profile to resume live tracking.</p>
                ) : (
                  <>
                    <strong>{row.weeklyUsed}% used</strong>
                    <Meter value={row.weeklyUsed ?? 0} tone={(row.weeklyUsed ?? 0) > 60 ? "warn" : "default"} />
                    <p>Reset {formatDate(row.weeklyReset)}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">At risk</p>
            <h3>Highest current load</h3>
          </div>
        </div>
        {hottest ? (
          <div className="spotlight-row">
            <strong>{hottest.profileId}</strong>
            <p>{hottest.account}</p>
            <span>{hottest.fiveHourUsed}% of the 5-hour budget is already consumed.</span>
          </div>
        ) : (
          <p className="muted-copy">No live usage rows are available yet.</p>
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
      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Shared AGENTS</p>
            <h3>One source of truth, no more copy-paste</h3>
          </div>
          <button className="ghost-button" type="button" onClick={onPrepareGlobalAgentsFile}>
            Prepare global AGENTS
          </button>
        </div>
        <PanelState loading={loading} error={error} />
        <div className="agents-stack">
          <article>
            <span>1</span>
            <h4>Global source</h4>
            <p>{agents?.globalPath || "`~/.cdx/AGENTS.md`"} is the reusable base ruleset.</p>
          </article>
          <article>
            <span>2</span>
            <h4>Project link</h4>
            <p>
              {agents?.projectState === "global-link"
                ? `${agents.projectAgentsPath} currently points at the shared file.`
                : "When a repo has no local file, cdx can place a managed link before launching Codex."}
            </p>
          </article>
          <article>
            <span>3</span>
            <h4>Local override</h4>
            <p>
              {agents?.projectState === "local-file"
                ? "This repo already owns its local AGENTS.md, so cdx leaves it alone."
                : "If a repo already owns its own AGENTS.md, cdx leaves it alone and reports the override."}
            </p>
          </article>
        </div>
      </section>

      <section className="section-card section-card--wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Coverage</p>
            <h3>Current repository rule source</h3>
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
          <p className="muted-copy">AGENTS status is not available yet.</p>
        )}
      </section>
    </>
  );
}

export function DoctorPanel({
  dashboard,
  loading,
  error,
  report,
  onRefreshDoctor,
}: PanelProps & {
  report: DoctorReport | null;
  onRefreshDoctor: () => void | Promise<void>;
}) {
  const doctor = report?.doctor ?? dashboard?.doctor ?? [];

  return (
    <>
      <section className="section-card section-card--wide">
        <div className="section-header">
          <div>
            <p className="eyebrow">Doctor</p>
            <h3>Actionable fixes before support requests pile up</h3>
          </div>
          <button className="ghost-button" type="button" onClick={onRefreshDoctor}>
            Refresh doctor
          </button>
        </div>
        <PanelState loading={loading} error={error} />
        <div className="doctor-list">
          {doctor.map((item) => (
            <article key={item.title} className="doctor-card">
              <div className={`doctor-severity is-${item.severity}`} />
              <div className="doctor-copy">
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
              </div>
              <code>{item.command}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Checks</p>
            <h3>What `cdx doctor` inspects</h3>
          </div>
        </div>
        <ul className="sidebar-bullets">
          <li>Does each profile directory exist and contain a valid auth state?</li>
          <li>Can the shared `AGENTS.md` be resolved from the current repo?</li>
          <li>Did `cdx usage` successfully read live usage for every profile?</li>
          <li>Is the common `codex` binary installed and executable?</li>
        </ul>
      </section>
    </>
  );
}
