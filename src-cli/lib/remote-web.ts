function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface RemotePageConfig {
  inviteToken: string;
  profileId: string;
  mode: string;
  otpRequired: boolean;
  otpExpiresLabel: string;
}

/* ───────────────────────── client JS ───────────────────────── */

function buildClientScript(config: RemotePageConfig): string {
  const serialized = JSON.stringify(config);
  return `
const CONFIG = ${serialized};
const THEME_KEY = 'cdx-remote-theme';
const REMOTE_ASSET_ROOT = '/__cdx/remote';
const THEMES = {
  'modern-dark': {
    metaColor: '#0a0e13',
    terminal: {
      background: '#0a0e13',
      foreground: '#e4ebf1',
      cursor: '#5fddcc',
      black: '#0a0e13',
      red: '#ff8f82',
      green: '#9fe6c8',
      yellow: '#f4dd8f',
      blue: '#8fb7ff',
      magenta: '#d7b0ff',
      cyan: '#7ce6f4',
      white: '#e4ebf1',
      brightBlack: '#5a6d7a',
      brightRed: '#ffb4aa',
      brightGreen: '#c7f4e3',
      brightYellow: '#fff2b8',
      brightBlue: '#bfd3ff',
      brightMagenta: '#ecd9ff',
      brightCyan: '#b8f9ff',
      brightWhite: '#ffffff',
      selectionBackground: 'rgba(95, 221, 204, 0.20)',
      selectionInactiveBackground: 'rgba(95, 221, 204, 0.10)',
    },
  },
  sepia: {
    metaColor: '#151009',
    terminal: {
      background: '#151009',
      foreground: '#efe0c8',
      cursor: '#ddb56e',
      black: '#151009',
      red: '#d97a6d',
      green: '#c6b07a',
      yellow: '#ddb56e',
      blue: '#b59672',
      magenta: '#d6a98f',
      cyan: '#d5bf9c',
      white: '#efe0c8',
      brightBlack: '#7a6646',
      brightRed: '#f09a83',
      brightGreen: '#dcc890',
      brightYellow: '#f7deb0',
      brightBlue: '#d3b08a',
      brightMagenta: '#ebc4ac',
      brightCyan: '#ead4b8',
      brightWhite: '#fff4e3',
      selectionBackground: 'rgba(221, 181, 110, 0.20)',
      selectionInactiveBackground: 'rgba(221, 181, 110, 0.12)',
    },
  },
  teal: {
    metaColor: '#c4e8e2',
    terminal: {
      background: '#061c19',
      foreground: '#e4f9f5',
      cursor: '#50d4c2',
      black: '#061c19',
      red: '#f2947f',
      green: '#79ddb5',
      yellow: '#e4d48a',
      blue: '#88c9d4',
      magenta: '#b7b3ff',
      cyan: '#67e4da',
      white: '#e4f9f5',
      brightBlack: '#4d7a74',
      brightRed: '#ffb39d',
      brightGreen: '#b8f0d7',
      brightYellow: '#f6e5ac',
      brightBlue: '#b6e1ea',
      brightMagenta: '#d9d3ff',
      brightCyan: '#affaf1',
      brightWhite: '#ffffff',
      selectionBackground: 'rgba(80, 212, 194, 0.20)',
      selectionInactiveBackground: 'rgba(80, 212, 194, 0.10)',
    },
  },
};
const THEME_LABELS = {
  'modern-dark': 'Midnight',
  sepia: 'Sepia',
  teal: 'Lagoon',
};
const STATUS_LABELS = {
  waiting: 'Idle',
  starting: 'Starting',
  running: 'Running',
  live: 'Live',
  reconnecting: 'Reconnecting',
  ended: 'Ended',
  succeeded: 'Done',
  failed: 'Failed',
  'socket error': 'Error',
  'polling failed': 'Error',
  'Prompt send failed': 'Send failed',
  'Interrupt failed': 'Interrupt failed',
};
const STATUS_TONES = {
  waiting: 'idle',
  starting: 'warm',
  running: 'good',
  live: 'good',
  reconnecting: 'warm',
  ended: 'idle',
  succeeded: 'idle',
  failed: 'danger',
  'socket error': 'danger',
  'polling failed': 'danger',
  'Prompt send failed': 'danger',
  'Interrupt failed': 'danger',
};
const els = {
  authStep: document.querySelector('[data-step="auth"]'),
  remoteStep: document.querySelector('[data-step="remote"]'),
  otpForm: document.querySelector('[data-otp-form]'),
  otpInput: document.querySelector('[data-otp-input]'),
  authMessage: document.querySelector('[data-auth-message]'),
  promptForm: document.querySelector('[data-prompt-form]'),
  promptInput: document.querySelector('[data-prompt-input]'),
  promptButton: document.querySelector('[data-prompt-button]'),
  interruptButton: document.querySelector('[data-interrupt-button]'),
  reconnectButton: document.querySelector('[data-reconnect-button]'),
  status: document.querySelector('[data-remote-status]'),
  statusLabel: document.querySelector('[data-status-label]'),
  themeToggle: document.querySelector('[data-theme-toggle]'),
  themeMenu: document.querySelector('[data-theme-menu]'),
  themeToggleLabel: document.querySelector('[data-theme-toggle-label]'),
  themeSwatch: document.querySelector('[data-theme-swatch]'),
  themeOptions: Array.from(document.querySelectorAll('[data-theme-option]')),
  terminal: document.querySelector('[data-terminal]'),
  terminalTouchSurface: document.querySelector('[data-terminal-touch-surface]'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
};

let socket = null;
let pollingTimer = null;
let authenticated = !CONFIG.otpRequired;
let lastEventId = 0;
let authToken = null;
let terminal = null;
let fitAddon = null;
let resizeTimer = null;
let hasBootstrappedTerminal = false;
let terminalTouchY = null;
let terminalTouchRemainder = 0;
let terminalTouchPointerId = null;
let themeMenuOpen = false;
let liveSlashDraft = '';
const withInviteToken = (path) => \`\${path}?t=\${encodeURIComponent(CONFIG.inviteToken)}\`;
const withAuth = (path) => {
  const separator = path.includes('?') ? '&' : '?';
  return authToken ? \`\${path}\${separator}a=\${encodeURIComponent(authToken)}\` : path;
};

const getStoredTheme = () => {
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored && stored in THEMES ? stored : 'modern-dark';
};

const loadScript = (src) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  const timeout = window.setTimeout(() => {
    script.remove();
    reject(new Error(\`Timed out while loading \${src}\`));
  }, 8000);
  script.src = src;
  script.onload = () => { window.clearTimeout(timeout); resolve(); };
  script.onerror = () => { window.clearTimeout(timeout); reject(new Error(\`Failed to load \${src}\`)); };
  document.head.appendChild(script);
});

const loadStylesheet = (href) => {
  if (document.querySelector(\`link[href="\${href}"]\`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
};

const formatStatusLabel = (v) => STATUS_LABELS[v] || v;
const getStatusTone = (v) => STATUS_TONES[v] || 'idle';

const ensureTerminal = async () => {
  if (terminal) return terminal;
  loadStylesheet(withInviteToken(\`\${REMOTE_ASSET_ROOT}/xterm.css\`));
  await loadScript(withInviteToken(\`\${REMOTE_ASSET_ROOT}/xterm.js\`));
  await loadScript(withInviteToken(\`\${REMOTE_ASSET_ROOT}/xterm-addon-fit.js\`));
  const T = window.Terminal;
  const F = window.FitAddon?.FitAddon;
  if (!T || !F) throw new Error('xterm load failed');
  terminal = new T({
    convertEol: true,
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    disableStdin: true,
    fontFamily: '"IBM Plex Mono", "SF Mono", "Menlo", monospace',
    fontSize: 13,
    lineHeight: 1.4,
    scrollback: 5000,
    theme: THEMES[getStoredTheme()].terminal,
  });
  fitAddon = new F();
  terminal.loadAddon(fitAddon);
  terminal.open(els.terminal);
  const viewport = els.terminal.querySelector('.xterm-viewport');
  if (viewport instanceof HTMLElement) {
    viewport.style.overscrollBehaviorY = 'contain';
    viewport.style.webkitOverflowScrolling = 'touch';
  }
  bindTerminalTouchSurface();
  fitTerminal();
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { fitTerminal(); sendResize(); }, 80);
  });
  return terminal;
};

const fitTerminal = () => { if (fitAddon && terminal) fitAddon.fit(); };

const sendResize = () => {
  if (!terminal || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
};

const getTerminalLineHeightPx = () => {
  const firstRow = els.terminal.querySelector('.xterm-rows > div');
  if (firstRow instanceof HTMLElement) {
    const measured = firstRow.getBoundingClientRect().height;
    if (measured > 0) return measured;
  }

  const viewport = els.terminal.querySelector('.xterm-viewport');
  const containerHeight =
    viewport instanceof HTMLElement ? viewport.clientHeight : els.terminal.clientHeight || 0;
  return Math.max(containerHeight / Math.max(terminal?.rows || 1, 1), 1);
};

const scrollTerminalFromTouchDelta = (deltaY) => {
  if (!terminal) return false;
  terminalTouchRemainder += deltaY;
  const lineHeightPx = getTerminalLineHeightPx();
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return false;
  const lines = Math.trunc(terminalTouchRemainder / lineHeightPx);
  if (lines === 0) return false;
  terminal.scrollLines(lines);
  terminalTouchRemainder -= lines * lineHeightPx;
  return true;
};

const resetTerminalTouchScroll = () => {
  terminalTouchY = null;
  terminalTouchRemainder = 0;
  terminalTouchPointerId = null;
};

const handleTerminalTouchStart = (event) => {
  if (!terminal || event.touches.length !== 1) return;
  terminalTouchY = event.touches[0].clientY;
  terminalTouchRemainder = 0;
  event.preventDefault();
};

const handleTerminalTouchMove = (event) => {
  if (!terminal || terminalTouchY === null || event.touches.length !== 1) return;
  const nextY = event.touches[0].clientY;
  scrollTerminalFromTouchDelta(terminalTouchY - nextY);
  terminalTouchY = nextY;
  event.preventDefault();
};

const handleTerminalPointerDown = (event) => {
  if (!terminal || event.pointerType !== 'touch') return;
  terminalTouchPointerId = event.pointerId;
  terminalTouchY = event.clientY;
  terminalTouchRemainder = 0;
  if (event.currentTarget instanceof HTMLElement) {
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Some browsers reject pointer capture for synthetic or early touch events.
    }
  }
  event.preventDefault();
};

const handleTerminalPointerMove = (event) => {
  if (
    !terminal ||
    event.pointerType !== 'touch' ||
    terminalTouchPointerId !== event.pointerId ||
    terminalTouchY === null
  ) {
    return;
  }

  const nextY = event.clientY;
  scrollTerminalFromTouchDelta(terminalTouchY - nextY);
  terminalTouchY = nextY;
  event.preventDefault();
};

const bindTerminalTouchSurface = () => {
  const surface = els.terminalTouchSurface;
  if (!(surface instanceof HTMLElement) || surface.dataset.touchScrollBound === 'true') return;
  surface.dataset.touchScrollBound = 'true';

  if ('PointerEvent' in window) {
    surface.addEventListener('pointerdown', handleTerminalPointerDown, { passive: false });
    surface.addEventListener('pointermove', handleTerminalPointerMove, { passive: false });
    surface.addEventListener('pointerup', resetTerminalTouchScroll, { passive: true });
    surface.addEventListener('pointercancel', resetTerminalTouchScroll, { passive: true });
    return;
  }

  surface.addEventListener('touchstart', handleTerminalTouchStart, { passive: false });
  surface.addEventListener('touchmove', handleTerminalTouchMove, { passive: false });
  surface.addEventListener('touchend', resetTerminalTouchScroll, { passive: true });
  surface.addEventListener('touchcancel', resetTerminalTouchScroll, { passive: true });
};

const sendInput = (data) => {
  if (!data || !socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type: 'input', data }));
  return true;
};

const setAuthMessage = (v, tone = 'neutral') => {
  if (!els.authMessage) return;
  els.authMessage.textContent = v;
  els.authMessage.dataset.tone = tone;
};

const setRemoteStatus = (v) => {
  if (!els.status) return;
  const known = Object.prototype.hasOwnProperty.call(STATUS_LABELS, v);
  if (known) {
    els.status.dataset.state = getStatusTone(v);
    if (els.statusLabel) els.statusLabel.textContent = formatStatusLabel(v);
    return;
  }
  let tone = 'idle';
  if (/error|failed/i.test(v)) tone = 'danger';
  else if (/lock|ready|required/i.test(v)) tone = 'warm';
  els.status.dataset.state = tone;
  if (els.statusLabel) els.statusLabel.textContent = v;
};

const closeThemeMenu = () => {
  themeMenuOpen = false;
  els.themeToggle?.setAttribute('aria-expanded', 'false');
  els.themeMenu?.setAttribute('hidden', '');
};

const openThemeMenu = () => {
  themeMenuOpen = true;
  els.themeToggle?.setAttribute('aria-expanded', 'true');
  els.themeMenu?.removeAttribute('hidden');
};

const toggleThemeMenu = () => {
  if (themeMenuOpen) closeThemeMenu();
  else openThemeMenu();
};

const syncSlashDraft = () => {
  const value = els.promptInput.value;
  const isSlashDraft = value.startsWith('/') && !value.includes('\\n');

  if (!isSlashDraft) {
    if (liveSlashDraft) {
      sendInput('\\u0015');
      liveSlashDraft = '';
    }
    return false;
  }

  let delta = '';
  if (value.startsWith(liveSlashDraft)) {
    delta = value.slice(liveSlashDraft.length);
  } else if (liveSlashDraft.startsWith(value)) {
    delta = '\\b'.repeat(liveSlashDraft.length - value.length);
  } else {
    delta = '\\u0015' + value;
  }

  const sent = sendInput(delta);
  if (sent) {
    liveSlashDraft = value;
  }
  return sent;
};

const applyTheme = (theme) => {
  const t = theme in THEMES ? theme : 'modern-dark';
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t === 'teal' ? 'light' : 'dark';
  window.localStorage.setItem(THEME_KEY, t);
  if (els.themeColor) els.themeColor.setAttribute('content', THEMES[t].metaColor);
  if (els.themeToggleLabel) els.themeToggleLabel.textContent = THEME_LABELS[t];
  if (els.themeSwatch) els.themeSwatch.style.background = THEMES[t].terminal.cursor;
  els.themeOptions.forEach((option) => {
    const active = option.dataset.themeOption === t;
    option.dataset.active = active ? 'true' : 'false';
    option.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (terminal) terminal.options.theme = THEMES[t].terminal;
};

const setAuthenticated = async (v) => {
  authenticated = v;
  els.authStep.classList.toggle('step-hidden', v);
  els.remoteStep.classList.toggle('step-hidden', !v);
  if (v) {
    await ensureTerminal();
    hasBootstrappedTerminal = false;
    setRemoteStatus('starting');
  } else {
    setRemoteStatus('waiting');
  }
};

const renderSnapshot = async (snap) => {
  if (!snap) return;
  setRemoteStatus(snap.finishedAt ? 'ended' : snap.status);
  const t = await ensureTerminal();
  t.reset();
  t.write((Array.isArray(snap.recentOutput) ? snap.recentOutput.join('\\r\\n') : '') + '\\r\\n');
  hasBootstrappedTerminal = true;
  fitTerminal();
};

const fetchSnapshot = async () => {
  try {
    const sessionPath = withAuth(\`/api/session?t=\${encodeURIComponent(CONFIG.inviteToken)}\`);
    const r = await fetch(sessionPath, { credentials: 'same-origin' });
    if (r.status === 401) { await setAuthenticated(false); setAuthMessage('Check the code and try again.', 'warn'); return; }
    await renderSnapshot(await r.json());
  } catch (e) {
    setRemoteStatus(e instanceof Error ? e.message : 'polling failed');
  }
};

const startPolling = () => {
  clearInterval(pollingTimer);
  pollingTimer = setInterval(() => { if (authenticated) void fetchSnapshot(); }, 1800);
};

const connect = async () => {
  if (!authenticated) return;
  await ensureTerminal();
  if (socket && socket.readyState === WebSocket.OPEN) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const q = lastEventId > 0
    ? \`cursor=\${encodeURIComponent(String(lastEventId))}\`
    : 'bootstrap=snapshot';
  socket = new WebSocket(\`\${proto}//\${location.host}\${withAuth(\`/api/ws?t=\${encodeURIComponent(CONFIG.inviteToken)}&\${q}\`)}\`);
  socket.addEventListener('open', () => {
    setRemoteStatus('live');
    clearInterval(pollingTimer);
    sendResize();
    if (els.promptInput.value.startsWith('/')) {
      liveSlashDraft = '';
      syncSlashDraft();
    }
  });
  socket.addEventListener('message', async (ev) => {
    const p = JSON.parse(String(ev.data));
    if (typeof p.eventId === 'number') lastEventId = Math.max(lastEventId, p.eventId);
    if (p.type === 'snapshot') { await renderSnapshot(p.snapshot); return; }
    if (p.type === 'pty') {
      const t = await ensureTerminal();
      if (!hasBootstrappedTerminal) { t.reset(); hasBootstrappedTerminal = true; }
      t.write(typeof p.chunk === 'string' ? p.chunk : '');
      return;
    }
    if (p.type === 'status') setRemoteStatus(p.status);
  });
  socket.addEventListener('close', () => { setRemoteStatus('reconnecting'); socket = null; liveSlashDraft = ''; startPolling(); });
  socket.addEventListener('error', () => { setRemoteStatus('socket error'); socket = null; liveSlashDraft = ''; startPolling(); });
};

/* ── OTP submit ── */
els.otpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const otp = els.otpInput.value.trim();
  if (!otp) { setAuthMessage('Enter the 6-digit code.', 'warn'); return; }
  setAuthMessage('Checking…', 'neutral');
  try {
    const r = await fetch('/api/auth/otp', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CONFIG.inviteToken, otp }),
    });
    if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.message || 'Authentication failed'); }
    const payload = await r.json().catch(() => null);
    authToken = typeof payload?.authToken === 'string' ? payload.authToken : null;
    await setAuthenticated(true);
    setAuthMessage('', 'neutral');
    connect();
  } catch (e) { setAuthMessage(e instanceof Error ? e.message : 'Authentication failed', 'warn'); }
});

/* ── Prompt submit ── */
els.promptForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const promptValue = els.promptInput.value;
  const prompt = promptValue.trim();
  if (!prompt) return;
  els.promptButton.disabled = true;
  try {
    const submittedLiveSlash =
      liveSlashDraft.length > 0 &&
      promptValue === liveSlashDraft &&
      sendInput('\\r');

    if (!submittedLiveSlash) {
      if (liveSlashDraft) {
        sendInput('\\u0015');
        liveSlashDraft = '';
      }

      const promptPath = withAuth(\`/api/prompts?t=\${encodeURIComponent(CONFIG.inviteToken)}\`);
      const r = await fetch(promptPath, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.message || 'Send failed'); }
    }

    els.promptInput.value = '';
    liveSlashDraft = '';
    els.promptInput.focus();
  } catch (e) { setRemoteStatus(e instanceof Error ? e.message : 'Prompt send failed'); }
  finally { els.promptButton.disabled = false; }
});

els.promptInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); els.promptForm.requestSubmit(); }
});
els.promptInput.addEventListener('input', () => {
  syncSlashDraft();
});

els.interruptButton.addEventListener('click', async () => {
  try { await fetch(withAuth(\`/api/interrupt?t=\${encodeURIComponent(CONFIG.inviteToken)}\`), { method: 'POST', credentials: 'same-origin' }); }
  catch (e) { setRemoteStatus(e instanceof Error ? e.message : 'Interrupt failed'); }
});

els.reconnectButton.addEventListener('click', async () => { await fetchSnapshot(); connect(); });
els.themeToggle.addEventListener('click', () => {
  toggleThemeMenu();
});
els.themeOptions.forEach((option) => {
  option.addEventListener('click', () => {
    applyTheme(option.dataset.themeOption || 'modern-dark');
    closeThemeMenu();
  });
});
document.addEventListener('click', (event) => {
  const target = event.target;
  if (
    themeMenuOpen &&
    target instanceof Node &&
    !els.themeMenu?.contains(target) &&
    !els.themeToggle?.contains(target)
  ) {
    closeThemeMenu();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeThemeMenu();
});

/* ── Theme ── */
applyTheme(getStoredTheme());

/* ── Init ── */
(async () => {
  await setAuthenticated(authenticated);
  if (authenticated) connect();
  else setAuthMessage(\`Enter the 6-digit code shown on your desktop.\`, 'neutral');
})();
`;
}

export function renderRemotePage(config: RemotePageConfig): string {
  const safeProfile = escapeHtml(config.profileId);
  const safeMode = escapeHtml(config.mode);
  const safeExpiry = escapeHtml(config.otpExpiresLabel);

  return `<!doctype html>
<html lang="en" data-theme="modern-dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#0a0e13" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <title>cdx · ${safeProfile}</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230a0e13'/%3E%3Ctext x='16' y='21' font-size='13' text-anchor='middle' fill='%235fddcc' font-family='monospace' font-weight='600'%3Ecdx%3C/text%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    /* ── reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      overflow: hidden;
      overscroll-behavior-y: none;
    }
    button, input, textarea { font: inherit; }
    button { cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    button:disabled { cursor: wait; opacity: 0.5; }
    :focus-visible { outline: 1.5px solid var(--accent); outline-offset: 2px; }

    /* ── tokens: modern-dark ── */
    :root {
      color-scheme: dark;
      --bg: #0a0e13;
      --surface: rgba(14, 19, 26, 0.92);
      --line: rgba(140, 180, 200, 0.10);
      --text: #dde6ee;
      --muted: #6b7d8a;
      --accent: #5fddcc;
      --danger: #ff8f82;
      --good: #7ade9e;
      --warm: #ebd07c;
      --terminal-bg: #0a0e13;
      --font: "IBM Plex Mono", "SF Mono", "Menlo", monospace;
    }

    /* ── tokens: sepia ── */
    :root[data-theme="sepia"] {
      color-scheme: dark;
      --bg: #151009;
      --surface: rgba(24, 18, 12, 0.92);
      --line: rgba(200, 170, 120, 0.12);
      --text: #efe0c8;
      --muted: #8a7656;
      --accent: #ddb56e;
      --danger: #d97a6d;
      --good: #c6b07a;
      --warm: #f7deb0;
      --terminal-bg: #151009;
    }

    /* ── tokens: teal ── */
    :root[data-theme="teal"] {
      color-scheme: dark;
      --bg: #061c19;
      --surface: rgba(8, 30, 26, 0.92);
      --line: rgba(80, 212, 194, 0.10);
      --text: #e4f9f5;
      --muted: #4d7a74;
      --accent: #50d4c2;
      --danger: #f2947f;
      --good: #79ddb5;
      --warm: #e4d48a;
      --terminal-bg: #061c19;
    }

    body {
      font-family: var(--font);
      color: var(--text);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
    }

    /* ══════════════ STEP 1: AUTH ══════════════ */
    .auth-view {
      display: grid;
      place-items: center;
      height: 100dvh;
      padding: 24px;
      padding-top: calc(24px + env(safe-area-inset-top));
      padding-bottom: calc(24px + env(safe-area-inset-bottom));
    }

    .auth-card {
      width: 100%;
      max-width: 340px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .auth-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .auth-brand-mark {
      width: 32px; height: 32px;
      display: grid; place-items: center;
      border-radius: 8px;
      background: var(--accent);
      color: var(--bg);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }

    .auth-brand-text {
      font-size: 13px;
      color: var(--muted);
      line-height: 1.3;
    }

    .auth-brand-text strong {
      color: var(--text);
      display: block;
      font-weight: 500;
    }

    .otp-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .otp-input {
      width: 100%;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface);
      color: var(--text);
      font-size: 24px;
      font-weight: 600;
      letter-spacing: 0.32em;
      text-align: center;
    }

    .otp-input::placeholder { color: var(--muted); opacity: 0.4; font-weight: 400; }

    .otp-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(95, 221, 204, 0.12);
    }

    .btn-primary {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 10px;
      background: var(--accent);
      color: var(--bg);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
      transition: opacity 0.15s;
    }
    .btn-primary:hover { opacity: 0.88; }

    .auth-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .meta-tag {
      font-size: 11px;
      color: var(--muted);
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--surface);
    }
    .meta-tag b { color: var(--text); font-weight: 500; }

    .auth-msg {
      min-height: 18px;
      font-size: 12px;
      color: var(--muted);
      text-align: center;
    }
    .auth-msg[data-tone="warn"] { color: var(--danger); }

    .step-hidden { display: none !important; }

    /* ══════════════ STEP 2: REMOTE ══════════════ */
    .remote-view {
      display: flex;
      flex-direction: column;
      height: 100dvh;
      overflow: hidden;
      overscroll-behavior-y: none;
    }

    /* ── top bar (minimal) ── */
    .remote-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      padding-top: calc(6px + env(safe-area-inset-top));
      border-bottom: 1px solid var(--line);
      flex-shrink: 0;
      background: var(--surface);
    }

    .remote-mark {
      width: 22px; height: 22px;
      display: grid; place-items: center;
      border-radius: 5px;
      background: var(--accent);
      color: var(--bg);
      font-size: 8px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .remote-meta {
      font-size: 11px;
      color: var(--muted);
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--muted);
      flex-shrink: 0;
      transition: background 0.2s;
    }
    .status-dot[data-state="good"] { background: var(--good); box-shadow: 0 0 6px var(--good); }
    .status-dot[data-state="warm"] { background: var(--warm); }
    .status-dot[data-state="danger"] { background: var(--danger); }

    .status-text {
      font-size: 10px;
      color: var(--muted);
      flex-shrink: 0;
    }

    .theme-shell {
      position: relative;
      margin-left: auto;
      flex-shrink: 0;
    }

    .theme-trigger {
      min-width: 112px;
      height: 30px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: color-mix(in srgb, var(--surface) 86%, black 14%);
      color: var(--text);
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: border-color 0.15s, transform 0.15s, background 0.15s;
    }
    .theme-trigger:hover {
      border-color: rgba(255, 255, 255, 0.18);
      transform: translateY(-1px);
    }

    .theme-trigger-left {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .theme-trigger-label {
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .theme-swatch {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.08);
      background: var(--accent);
      flex-shrink: 0;
    }

    .theme-chevron {
      width: 12px;
      height: 12px;
      color: var(--muted);
      flex-shrink: 0;
    }

    .theme-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      width: 168px;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: color-mix(in srgb, var(--surface) 88%, black 12%);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(18px);
      display: grid;
      gap: 6px;
      z-index: 5;
    }

    .theme-menu[hidden] {
      display: none;
    }

    .theme-option {
      width: 100%;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--text);
      padding: 9px 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      text-align: left;
      transition: border-color 0.15s, background 0.15s, transform 0.15s;
    }
    .theme-option:hover {
      transform: translateY(-1px);
      background: rgba(255, 255, 255, 0.04);
    }
    .theme-option[data-active="true"] {
      border-color: var(--line);
      background: rgba(255, 255, 255, 0.04);
    }

    .theme-option-swatch {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      flex-shrink: 0;
    }
    .theme-option-swatch[data-theme-option-swatch="modern-dark"] { background: #5fddcc; }
    .theme-option-swatch[data-theme-option-swatch="sepia"] { background: #ddb56e; }
    .theme-option-swatch[data-theme-option-swatch="teal"] { background: #50d4c2; }

    .theme-option-copy {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .theme-option-title {
      font-size: 11px;
      color: var(--text);
    }

    .theme-option-note {
      font-size: 10px;
      color: var(--muted);
    }

    /* ── terminal area ── */
    .terminal-area {
      --terminal-mask-height: 34px;
      position: relative;
      flex: 1;
      min-height: 0;
      background: var(--terminal-bg);
      overflow: hidden;
      overscroll-behavior-y: contain;
      touch-action: pan-y;
    }
    .terminal-area::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: var(--terminal-mask-height);
      background: linear-gradient(180deg, transparent 0%, var(--terminal-bg) 55%, var(--terminal-bg) 100%);
      pointer-events: none;
      z-index: 2;
    }

    .terminal-host {
      position: relative;
      height: calc(100% - var(--terminal-mask-height));
      overscroll-behavior-y: contain;
      touch-action: pan-y;
    }

    .terminal-host .xterm,
    .terminal-host .xterm-scrollable-element,
    .terminal-host .xterm-viewport {
      overscroll-behavior-y: contain;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
    }

    .terminal-touch-surface {
      display: none;
    }

    @media (hover: none), (pointer: coarse) {
      .terminal-touch-surface {
        display: block;
        position: absolute;
        inset: 0 0 var(--terminal-mask-height) 0;
        z-index: 1;
        touch-action: none;
      }
    }

    /* ── bottom prompt bar ── */
    .prompt-bar {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      padding: 8px 10px;
      padding-bottom: calc(8px + env(safe-area-inset-bottom));
      border-top: 1px solid var(--line);
      background: var(--surface);
      flex-shrink: 0;
    }

    .prompt-input {
      flex: 1;
      min-height: 38px;
      max-height: 120px;
      padding: 9px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font-size: 13px;
      line-height: 1.4;
      resize: none;
    }
    .prompt-input:focus { border-color: var(--accent); }

    .prompt-send {
      width: 38px; height: 38px;
      border: none;
      border-radius: 8px;
      background: var(--accent);
      color: var(--bg);
      display: grid; place-items: center;
      flex-shrink: 0;
      transition: opacity 0.15s;
    }
    .prompt-send:hover { opacity: 0.88; }

    .prompt-send svg { width: 16px; height: 16px; }

    .btn-icon {
      width: 38px; height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: transparent;
      color: var(--muted);
      display: grid; place-items: center;
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s;
    }
    .btn-icon:hover { color: var(--text); border-color: var(--muted); }
    .btn-icon.btn-danger:hover { color: var(--danger); border-color: var(--danger); }

    .btn-icon svg { width: 14px; height: 14px; }

    /* ── xterm overrides ── */
    .xterm { padding: 4px; }
    .xterm .xterm-cursor-layer .xterm-cursor {
      box-shadow: none !important;
      outline: none !important;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
      }
    }

    /* ── wider screens: side-by-side prompt ── */
    @media (min-width: 960px) {
      .prompt-input { max-height: 160px; }
    }
  </style>
</head>
<body>
  <!-- ═══ STEP 1: AUTH ═══ -->
  <section class="auth-view${config.otpRequired ? "" : " step-hidden"}" data-step="auth">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-brand-mark">cdx</div>
        <div class="auth-brand-text">
          <strong>Mobile Remote Terminal</strong>
          Connect to your desktop Codex session
        </div>
      </div>

      <form class="otp-group" data-otp-form>
        <input
          class="otp-input"
          type="text"
          data-otp-input
          inputmode="numeric"
          autocomplete="one-time-code"
          autocapitalize="off"
          spellcheck="false"
          maxlength="8"
          placeholder="000000"
          autofocus
        />
        <button class="btn-primary" type="submit">Connect</button>
      </form>

      <div class="auth-meta">
        <span class="meta-tag"><b>${safeProfile}</b></span>
        <span class="meta-tag">${safeMode}</span>
        <span class="meta-tag">Expires ${safeExpiry}</span>
      </div>

      <p class="auth-msg" data-auth-message role="status" aria-live="polite"></p>
    </div>
  </section>

  <!-- ═══ STEP 2: REMOTE ═══ -->
  <section class="remote-view${config.otpRequired ? " step-hidden" : ""}" data-step="remote">
    <div class="remote-bar">
      <div class="remote-mark">cdx</div>
      <span class="remote-meta">${safeProfile} · ${safeMode}</span>
      <span class="status-dot" data-remote-status data-state="idle"></span>
      <span class="status-text" data-status-label>Idle</span>
      <div class="theme-shell">
        <button class="theme-trigger" type="button" data-theme-toggle aria-expanded="false" aria-haspopup="menu" aria-label="Choose theme">
          <span class="theme-trigger-left">
            <span class="theme-swatch" data-theme-swatch></span>
            <span class="theme-trigger-label" data-theme-toggle-label>Midnight</span>
          </span>
          <svg class="theme-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="theme-menu" data-theme-menu hidden>
          <button class="theme-option" type="button" data-theme-option="modern-dark" data-active="true" aria-pressed="true">
            <span class="theme-option-swatch" data-theme-option-swatch="modern-dark"></span>
            <span class="theme-option-copy">
              <span class="theme-option-title">Midnight</span>
              <span class="theme-option-note">Dark glass + cyan cursor</span>
            </span>
          </button>
          <button class="theme-option" type="button" data-theme-option="sepia" data-active="false" aria-pressed="false">
            <span class="theme-option-swatch" data-theme-option-swatch="sepia"></span>
            <span class="theme-option-copy">
              <span class="theme-option-title">Sepia</span>
              <span class="theme-option-note">Warm paper + amber glow</span>
            </span>
          </button>
          <button class="theme-option" type="button" data-theme-option="teal" data-active="false" aria-pressed="false">
            <span class="theme-option-swatch" data-theme-option-swatch="teal"></span>
            <span class="theme-option-copy">
              <span class="theme-option-title">Lagoon</span>
              <span class="theme-option-note">Cool ink + bright seafoam</span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <div class="terminal-area">
      <div class="terminal-host" data-terminal></div>
      <div class="terminal-touch-surface" data-terminal-touch-surface aria-hidden="true"></div>
    </div>

    <div class="prompt-bar">
      <button class="btn-icon btn-danger" type="button" data-interrupt-button aria-label="Interrupt">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <button class="btn-icon" type="button" data-reconnect-button aria-label="Reconnect">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      </button>
      <form class="prompt-bar" style="display:contents" data-prompt-form>
        <textarea
          class="prompt-input"
          rows="1"
          data-prompt-input
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        ></textarea>
        <button class="prompt-send" type="submit" data-prompt-button aria-label="Send">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94l18-8a.75.75 0 0 0 0-1.38l-18-8Z"/></svg>
        </button>
      </form>
    </div>
  </section>

  <script>${buildClientScript(config)}</script>
</body>
</html>`;
}
