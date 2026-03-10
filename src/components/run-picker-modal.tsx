import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ActionSession, DashboardProfile } from "../data";

interface RunPickerModalProps {
  open: boolean;
  onClose: () => void;
  profiles: DashboardProfile[];
  loading: boolean;
  onRunProfile: (profileId: string) => void;
  activeSession: ActionSession | null;
}

function formatRefresh(value: string | null): string {
  if (!value) {
    return "Auth refresh unknown";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Auth refresh unknown" : `Auth refresh ${date.toLocaleString()}`;
}

export function RunPickerModal({
  open,
  onClose,
  profiles,
  loading,
  onRunProfile,
  activeSession,
}: RunPickerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = profiles.length === 0 ? 0 : Math.min(selectedIndex, profiles.length - 1);

  useEffect(() => {
    if (!open) {
      return;
    }

    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key === "Tab" && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    if (profiles.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % profiles.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + profiles.length) % profiles.length);
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onRunProfile(profiles[activeIndex].id);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Run picker"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">cdx run</p>
            <h3>Select a profile</h3>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="muted-copy">Choose a profile. Press Enter to launch.</p>

        <div className="picker-list">
          {loading ? <p className="muted-copy">Fetching connected profiles…</p> : null}
          {!loading && profiles.length === 0 ? <p className="muted-copy">No profiles found yet.</p> : null}
          {!loading
            ? profiles.map((profile, index) => (
                <button
                  key={profile.id}
                  className={`picker-row ${index === activeIndex ? "is-highlighted" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelectedIndex(index);
                    onRunProfile(profile.id);
                  }}
                >
                  <div className="picker-rank">{index + 1}</div>
                  <div className="picker-main">
                    <strong>{profile.id}</strong>
                    <p>{profile.account}</p>
                  </div>
                  <div className="picker-side">
                    <span>{profile.plan || "unknown plan"}</span>
                    <small>{formatRefresh(profile.lastRefresh)}</small>
                  </div>
                </button>
              ))
            : null}
        </div>

        <div className="modal-footer">
          <code>Enter</code>
          <span>launch</span>
          <code>↑ ↓</code>
          <span>move</span>
          <code>Esc</code>
          <span>close</span>
          {activeSession ? <span>Current session: {activeSession.status}</span> : null}
        </div>
      </div>
    </div>
  );
}
