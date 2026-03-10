function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
function buildClientScript(config) {
    const serialized = JSON.stringify(config);
    return `
const CONFIG = ${serialized};
const THEME_KEY = 'cdx-remote-theme';
const THEMES = {
  'modern-dark': {
    metaColor: '#0d1319',
    terminal: {
      background: '#071018',
      foreground: '#eef8ff',
      cursor: '#7be7dc',
      black: '#071018',
      red: '#ff8f82',
      green: '#9fe6c8',
      yellow: '#f4dd8f',
      blue: '#8fb7ff',
      magenta: '#d7b0ff',
      cyan: '#7ce6f4',
      white: '#eef8ff',
      brightBlack: '#6c8698',
      brightRed: '#ffb4aa',
      brightGreen: '#c7f4e3',
      brightYellow: '#fff2b8',
      brightBlue: '#bfd3ff',
      brightMagenta: '#ecd9ff',
      brightCyan: '#b8f9ff',
      brightWhite: '#ffffff',
      selectionBackground: 'rgba(123, 231, 220, 0.24)',
      selectionInactiveBackground: 'rgba(123, 231, 220, 0.14)',
    },
  },
  sepia: {
    metaColor: '#1b140f',
    terminal: {
      background: '#1b140f',
      foreground: '#f6e7cf',
      cursor: '#f0c78f',
      black: '#1b140f',
      red: '#d97a6d',
      green: '#c6b07a',
      yellow: '#f0c78f',
      blue: '#b59672',
      magenta: '#d6a98f',
      cyan: '#d5bf9c',
      white: '#f6e7cf',
      brightBlack: '#8d7556',
      brightRed: '#f09a83',
      brightGreen: '#dcc890',
      brightYellow: '#f7deb0',
      brightBlue: '#d3b08a',
      brightMagenta: '#ebc4ac',
      brightCyan: '#ead4b8',
      brightWhite: '#fff4e3',
      selectionBackground: 'rgba(232, 192, 137, 0.24)',
      selectionInactiveBackground: 'rgba(232, 192, 137, 0.16)',
    },
  },
  teal: {
    metaColor: '#cfeee8',
    terminal: {
      background: '#08201d',
      foreground: '#ebfffb',
      cursor: '#66e1cf',
      black: '#08201d',
      red: '#f2947f',
      green: '#79ddb5',
      yellow: '#e4d48a',
      blue: '#88c9d4',
      magenta: '#b7b3ff',
      cyan: '#67e4da',
      white: '#ebfffb',
      brightBlack: '#5c8882',
      brightRed: '#ffb39d',
      brightGreen: '#b8f0d7',
      brightYellow: '#f6e5ac',
      brightBlue: '#b6e1ea',
      brightMagenta: '#d9d3ff',
      brightCyan: '#affaf1',
      brightWhite: '#ffffff',
      selectionBackground: 'rgba(102, 225, 207, 0.24)',
      selectionInactiveBackground: 'rgba(102, 225, 207, 0.14)',
    },
  },
};
const STATUS_LABELS = {
  waiting: '연결 대기',
  starting: '시작 중',
  running: '실행 중',
  live: '연결됨',
  reconnecting: '재연결 중',
  ended: '종료됨',
  succeeded: '완료됨',
  failed: '실패',
  'socket error': '소켓 오류',
  'polling failed': '상태 확인 실패',
  'Prompt send failed': '전송 실패',
  'Interrupt failed': '중단 실패',
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
const AUTH_LABELS = {
  waiting: '인증 대기',
  verified: '기기 확인',
};
const els = {
  authStep: document.querySelector('[data-step="auth"]'),
  remoteStep: document.querySelector('[data-step="remote"]'),
  otpForm: document.querySelector('[data-otp-form]'),
  otpInput: document.querySelector('[data-otp-input]'),
  authMessage: document.querySelector('[data-auth-message]'),
  authStatus: document.querySelector('[data-auth-status]'),
  promptForm: document.querySelector('[data-prompt-form]'),
  promptInput: document.querySelector('[data-prompt-input]'),
  promptButton: document.querySelector('[data-prompt-button]'),
  interruptButton: document.querySelector('[data-interrupt-button]'),
  reconnectButton: document.querySelector('[data-reconnect-button]'),
  status: document.querySelector('[data-remote-status]'),
  remoteMessage: document.querySelector('[data-remote-message]'),
  profile: document.querySelector('[data-profile]'),
  mode: document.querySelector('[data-mode]'),
  themeButtons: Array.from(document.querySelectorAll('[data-theme-button]')),
  terminal: document.querySelector('[data-terminal]'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
};

let socket = null;
let pollingTimer = null;
let authenticated = !CONFIG.otpRequired;
let lastEventId = 0;
let terminal = null;
let fitAddon = null;
let resizeTimer = null;
let hasBootstrappedTerminal = false;

const getStoredTheme = () => {
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored && stored in THEMES ? stored : 'modern-dark';
};

const loadScript = (src) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = src;
  script.onload = () => resolve();
  script.onerror = () => reject(new Error(\`Failed to load \${src}\`));
  document.head.appendChild(script);
});

const loadStylesheet = (href) => {
  if (document.querySelector(\`link[href="\${href}"]\`)) {
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
};

const formatStatusLabel = (value) => STATUS_LABELS[value] || value;
const getStatusTone = (value) => STATUS_TONES[value] || 'idle';

const setRemoteMessage = (value, tone = 'neutral') => {
  if (!els.remoteMessage) {
    return;
  }
  els.remoteMessage.textContent = value;
  els.remoteMessage.dataset.tone = tone;
};

const ensureTerminal = async () => {
  if (terminal) {
    return terminal;
  }

  loadStylesheet('https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css');
  await loadScript('https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js');

  const TerminalCtor = window.Terminal;
  const FitAddonCtor = window.FitAddon?.FitAddon;
  if (!TerminalCtor || !FitAddonCtor) {
    throw new Error('xterm.js failed to load');
  }

  terminal = new TerminalCtor({
    convertEol: true,
    cursorBlink: false,
    disableStdin: true,
    fontFamily: '"IBM Plex Mono", "SFMono-Regular", "Menlo", monospace',
    fontSize: 13,
    lineHeight: 1.45,
    scrollback: 5000,
    theme: THEMES[getStoredTheme()].terminal,
  });

  fitAddon = new FitAddonCtor();
  terminal.loadAddon(fitAddon);
  terminal.open(els.terminal);
  fitTerminal();
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      fitTerminal();
      sendResize();
    }, 80);
  });
  return terminal;
};

const fitTerminal = () => {
  if (!fitAddon || !terminal) {
    return;
  }
  fitAddon.fit();
};

const sendResize = () => {
  if (!terminal || !socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify({
    type: 'resize',
    cols: terminal.cols,
    rows: terminal.rows,
  }));
};

const setAuthMessage = (value, tone = 'neutral') => {
  if (!els.authMessage) {
    return;
  }
  els.authMessage.textContent = value;
  els.authMessage.dataset.tone = tone;
};

const setAuthState = (value) => {
  if (!els.authStatus) {
    return;
  }
  const next = value ? 'verified' : 'waiting';
  els.authStatus.textContent = AUTH_LABELS[next];
  els.authStatus.dataset.state = next === 'verified' ? 'good' : 'idle';
};

const setRemoteStatus = (value) => {
  if (!els.status) {
    return;
  }
  const known = Object.prototype.hasOwnProperty.call(STATUS_LABELS, value);
  if (known) {
    els.status.textContent = formatStatusLabel(value);
    els.status.dataset.state = getStatusTone(value);
    setRemoteMessage('', 'neutral');
    return;
  }

  let label = '상태 알림';
  let tone = 'idle';
  if (/unexpected token|error|failed/i.test(value)) {
    label = '연결 오류';
    tone = 'danger';
  } else if (/lock/i.test(value)) {
    label = '입력 잠금';
    tone = 'warm';
  } else if (/ready|required/i.test(value)) {
    label = '준비 안됨';
    tone = 'warm';
  }

  els.status.textContent = label;
  els.status.dataset.state = tone;
  setRemoteMessage(value, tone === 'danger' ? 'warn' : 'neutral');
};

const applyTheme = (theme) => {
  const nextTheme = theme in THEMES ? theme : 'modern-dark';
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme === 'modern-dark' ? 'dark' : 'light';
  window.localStorage.setItem(THEME_KEY, nextTheme);
  if (els.themeColor) {
    els.themeColor.setAttribute('content', THEMES[nextTheme].metaColor);
  }
  els.themeButtons.forEach((button) => {
    const isActive = button.dataset.themeButton === nextTheme;
    button.dataset.active = isActive ? 'true' : 'false';
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  if (terminal) {
    terminal.options.theme = THEMES[nextTheme].terminal;
  }
};

const setAuthenticated = async (value) => {
  authenticated = value;
  els.authStep.hidden = value;
  els.remoteStep.hidden = !value;
  setAuthState(value);
  if (value) {
    await ensureTerminal();
    hasBootstrappedTerminal = false;
    setRemoteStatus('starting');
  } else {
    setRemoteStatus('waiting');
  }
};

const renderSnapshot = async (snapshot) => {
  if (!snapshot) {
    return;
  }

  if (els.profile) {
    els.profile.textContent = snapshot.profileId;
  }
  if (els.mode) {
    els.mode.textContent = snapshot.mode;
  }
  setRemoteStatus(snapshot.finishedAt ? 'ended' : snapshot.status);

  const term = await ensureTerminal();
  term.reset();
  term.write((Array.isArray(snapshot.recentOutput) ? snapshot.recentOutput.join('\\r\\n') : '') + '\\r\\n');
  hasBootstrappedTerminal = true;
  fitTerminal();
};

const fetchSnapshot = async () => {
  try {
    const response = await fetch(\`/api/session?t=\${encodeURIComponent(CONFIG.inviteToken)}\`, {
      credentials: 'same-origin',
    });

    if (response.status === 401) {
      await setAuthenticated(false);
      setAuthMessage('코드를 다시 확인하세요.', 'warn');
      return;
    }

    const payload = await response.json();
    await renderSnapshot(payload);
  } catch (error) {
    setRemoteStatus(error instanceof Error ? error.message : 'polling failed');
  }
};

const startPolling = () => {
  window.clearInterval(pollingTimer);
  pollingTimer = window.setInterval(() => {
    if (authenticated) {
      void fetchSnapshot();
    }
  }, 1800);
};

const connect = async () => {
  if (!authenticated) {
    return;
  }

  await ensureTerminal();

  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = lastEventId > 0
    ? \`cursor=\${encodeURIComponent(String(lastEventId))}\`
    : 'bootstrap=snapshot';
  socket = new WebSocket(\`\${protocol}//\${window.location.host}/api/ws?t=\${encodeURIComponent(CONFIG.inviteToken)}&\${query}\`);

  socket.addEventListener('open', () => {
    setRemoteStatus('live');
    window.clearInterval(pollingTimer);
    sendResize();
  });

  socket.addEventListener('message', async (event) => {
    const payload = JSON.parse(String(event.data));
    if (typeof payload.eventId === 'number') {
      lastEventId = Math.max(lastEventId, payload.eventId);
    }
    if (payload.type === 'snapshot') {
      await renderSnapshot(payload.snapshot);
      return;
    }
    if (payload.type === 'pty') {
      const term = await ensureTerminal();
      if (!hasBootstrappedTerminal) {
        term.reset();
        hasBootstrappedTerminal = true;
      }
      term.write(typeof payload.chunk === 'string' ? payload.chunk : '');
      return;
    }
    if (payload.type === 'status') {
      setRemoteStatus(payload.status);
    }
  });

  socket.addEventListener('close', () => {
    setRemoteStatus('reconnecting');
    socket = null;
    startPolling();
  });

  socket.addEventListener('error', () => {
    setRemoteStatus('socket error');
    socket = null;
    startPolling();
  });
};

els.otpForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const otp = els.otpInput.value.trim();
  if (!otp) {
    setAuthMessage('6자리 코드를 입력하세요.', 'warn');
    return;
  }

  setAuthMessage('확인 중…', 'neutral');
  try {
    const response = await fetch('/api/auth/otp', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CONFIG.inviteToken, otp }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || 'OTP verification failed');
    }

    await setAuthenticated(true);
    setAuthMessage('', 'neutral');
    connect();
  } catch (error) {
    setAuthMessage(error instanceof Error ? error.message : 'OTP verification failed', 'warn');
  }
});

els.promptForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = els.promptInput.value.trim();
  if (!prompt) {
    return;
  }

  const idleLabel = els.promptButton.textContent;
  els.promptButton.disabled = true;
  els.promptButton.textContent = '전송 중…';
  try {
    const response = await fetch(\`/api/prompts?t=\${encodeURIComponent(CONFIG.inviteToken)}\`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || 'Prompt send failed');
    }

    els.promptInput.value = '';
    els.promptInput.focus();
  } catch (error) {
    setRemoteStatus(error instanceof Error ? error.message : 'Prompt send failed');
  } finally {
    els.promptButton.disabled = false;
    els.promptButton.textContent = idleLabel;
  }
});

els.promptInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    els.promptForm.requestSubmit();
  }
});

els.interruptButton.addEventListener('click', async () => {
  try {
    await fetch(\`/api/interrupt?t=\${encodeURIComponent(CONFIG.inviteToken)}\`, {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch (error) {
    setRemoteStatus(error instanceof Error ? error.message : 'Interrupt failed');
  }
});

els.reconnectButton.addEventListener('click', async () => {
  await fetchSnapshot();
  connect();
});

if (els.profile) {
  els.profile.textContent = CONFIG.profileId;
}
if (els.mode) {
  els.mode.textContent = CONFIG.mode;
}

applyTheme(getStoredTheme());
els.themeButtons.forEach((button) => {
  button.addEventListener('click', () => applyTheme(button.dataset.themeButton || 'modern-dark'));
});

(async () => {
  await setAuthenticated(authenticated);
  if (authenticated) {
    connect();
  } else {
    setAuthMessage(\`6자리 코드를 입력하세요. 만료: \${CONFIG.otpExpiresLabel}\`, 'neutral');
  }
})();
`;
}
export function renderRemotePage(config) {
    const safeProfile = escapeHtml(config.profileId);
    const safeMode = escapeHtml(config.mode);
    const safeExpiry = escapeHtml(config.otpExpiresLabel);
    return `<!doctype html>
<html lang="ko" data-theme="modern-dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0d1319" />
    <title>cdx remote</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='10' fill='%230d1319'/%3E%3Ctext x='16' y='20' font-size='12' text-anchor='middle' fill='white' font-family='Arial'%3Ecdx%3C/text%3E%3C/svg%3E" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://cdn.jsdelivr.net" />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      :root {
        color-scheme: dark;
        --bg: #0d1319;
        --bg-glow: rgba(123, 231, 220, 0.2);
        --surface: rgba(13, 19, 25, 0.88);
        --surface-strong: rgba(17, 25, 33, 0.96);
        --surface-soft: rgba(20, 32, 43, 0.9);
        --line: rgba(160, 199, 222, 0.14);
        --line-strong: rgba(123, 231, 220, 0.32);
        --text: #eef8ff;
        --muted: #8ea3b1;
        --accent: #7be7dc;
        --accent-strong: #bff8f2;
        --danger: #ff9d8b;
        --good: #8fe7b7;
        --warm: #f3d88a;
        --shadow: 0 30px 90px rgba(0, 0, 0, 0.34);
        --shadow-soft: 0 18px 40px rgba(0, 0, 0, 0.22);
        --terminal-bg: #071018;
        --radius-xl: 30px;
        --radius-lg: 24px;
        --radius-md: 18px;
        --radius-sm: 14px;
      }

      :root[data-theme="sepia"] {
        color-scheme: dark;
        --bg: #17110b;
        --bg-glow: rgba(232, 192, 137, 0.22);
        --surface: rgba(26, 19, 14, 0.88);
        --surface-strong: rgba(34, 25, 18, 0.96);
        --surface-soft: rgba(46, 33, 24, 0.92);
        --line: rgba(224, 191, 141, 0.16);
        --line-strong: rgba(224, 191, 141, 0.34);
        --text: #f7ead6;
        --muted: #c2ac87;
        --accent: #e8c089;
        --accent-strong: #f7deb0;
        --danger: #ffb39e;
        --good: #d6c38e;
        --warm: #f7deb0;
        --shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
        --shadow-soft: 0 18px 42px rgba(0, 0, 0, 0.3);
        --terminal-bg: #1b140f;
      }

      :root[data-theme="teal"] {
        color-scheme: light;
        --bg: #cfeee8;
        --bg-glow: rgba(19, 138, 131, 0.18);
        --surface: rgba(234, 248, 245, 0.86);
        --surface-strong: rgba(242, 252, 249, 0.96);
        --surface-soft: rgba(224, 245, 241, 0.92);
        --line: rgba(8, 47, 45, 0.12);
        --line-strong: rgba(19, 138, 131, 0.28);
        --text: #0b2322;
        --muted: #567273;
        --accent: #138a83;
        --accent-strong: #0f635e;
        --danger: #b85c49;
        --good: #138a83;
        --warm: #a9772b;
        --shadow: 0 24px 72px rgba(11, 43, 42, 0.14);
        --shadow-soft: 0 14px 30px rgba(11, 43, 42, 0.12);
        --terminal-bg: #08201d;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        min-height: 100%;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        margin: 0;
        overflow-x: hidden;
        color: var(--text);
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, var(--bg-glow), transparent 28%),
          radial-gradient(circle at right 10%, rgba(255, 255, 255, 0.18), transparent 22%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.14), transparent 34%),
          var(--bg);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
        background-size: 24px 24px;
        opacity: 0.14;
        pointer-events: none;
      }

      button,
      input,
      textarea {
        font: inherit;
      }

      button {
        cursor: pointer;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.6;
      }

      h1,
      h2,
      p {
        margin: 0;
        text-wrap: balance;
      }

      strong,
      .meta-pill,
      .status-pill,
      .otp-input,
      .theme-button {
        font-variant-numeric: tabular-nums;
      }

      :focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 3px;
      }

      main {
        position: relative;
        width: min(100%, 1180px);
        margin: 0 auto;
        padding:
          calc(16px + env(safe-area-inset-top))
          max(14px, env(safe-area-inset-right))
          calc(24px + env(safe-area-inset-bottom))
          max(14px, env(safe-area-inset-left));
      }

      .device-frame {
        display: grid;
        gap: 14px;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 24%),
          var(--surface);
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }

      .chrome,
      .session-rail,
      .theme-switch,
      .utility-row,
      .terminal-header {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .chrome,
      .terminal-header {
        justify-content: space-between;
      }

      .chrome {
        flex-direction: column;
        align-items: flex-start;
        padding: 6px 2px 2px;
      }

      .brand-lockup {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 62px;
        height: 62px;
        flex: 0 0 auto;
        border-radius: 20px;
        border: 1px solid var(--line-strong);
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.34), transparent 56%),
          linear-gradient(145deg, var(--accent), color-mix(in oklab, var(--accent) 56%, white));
        color: white;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), var(--shadow-soft);
        font-family: "IBM Plex Mono", monospace;
        font-size: 1.2rem;
        font-weight: 600;
      }

      .eyebrow {
        margin-bottom: 0.45rem;
        color: var(--muted);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .brand-lockup h1,
      .hero-card h2,
      .terminal-header h2 {
        font-family: "Fraunces", serif;
        letter-spacing: -0.04em;
        line-height: 0.98;
      }

      .brand-lockup h1 {
        font-size: clamp(2rem, 10vw, 3.9rem);
      }

      .theme-switch,
      .session-rail {
        flex-wrap: wrap;
      }

      .theme-button,
      .meta-pill,
      .status-pill,
      .primary-button,
      .secondary-button,
      .danger-button,
      .otp-input,
      .composer-input {
        border-radius: 999px;
        border: 1px solid var(--line);
        transition:
          transform 160ms ease,
          border-color 160ms ease,
          background-color 160ms ease,
          box-shadow 160ms ease,
          color 160ms ease;
      }

      .theme-button {
        width: auto;
        min-height: 2.6rem;
        padding: 0.62rem 0.9rem;
        background: var(--surface-soft);
        color: var(--muted);
      }

      .theme-button[data-active="true"],
      .theme-button:hover {
        color: var(--text);
        border-color: var(--line-strong);
        background: color-mix(in oklab, var(--accent) 10%, var(--surface-soft));
        box-shadow: var(--shadow-soft);
      }

      .session-rail {
        padding: 0 2px 4px;
      }

      .meta-pill,
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.55rem;
        padding: 0.65rem 0.9rem;
        background: var(--surface-soft);
        color: var(--muted);
      }

      .meta-pill strong {
        color: var(--text);
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .status-pill {
        border-color: color-mix(in oklab, var(--line) 70%, transparent);
      }

      .status-pill[data-state="good"] {
        color: var(--good);
        border-color: color-mix(in oklab, var(--good) 34%, var(--line));
        background: color-mix(in oklab, var(--good) 10%, var(--surface-soft));
      }

      .status-pill[data-state="warm"] {
        color: var(--warm);
        border-color: color-mix(in oklab, var(--warm) 34%, var(--line));
        background: color-mix(in oklab, var(--warm) 10%, var(--surface-soft));
      }

      .status-pill[data-state="danger"] {
        color: var(--danger);
        border-color: color-mix(in oklab, var(--danger) 38%, var(--line));
        background: color-mix(in oklab, var(--danger) 10%, var(--surface-soft));
      }

      .step[hidden] {
        display: none;
      }

      .auth-layout,
      .remote-layout {
        display: grid;
        gap: 14px;
      }

      .hero-card,
      .form-card,
      .terminal-panel,
      .composer-panel {
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--surface-strong);
        box-shadow: var(--shadow-soft);
      }

      .hero-card,
      .form-card,
      .composer-panel {
        padding: 18px;
      }

      .hero-card {
        display: grid;
        gap: 0.9rem;
        min-height: 15rem;
        align-content: start;
      }

      .hero-card h2,
      .terminal-header h2 {
        font-size: clamp(1.7rem, 7vw, 2.8rem);
      }

      .copy,
      .hint,
      .message,
      .field-label,
      .terminal-note {
        color: var(--muted);
        line-height: 1.55;
      }

      .hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
      }

      .form-card form,
      .composer-panel form {
        display: grid;
        gap: 12px;
      }

      .field-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .field-label {
        font-size: 0.92rem;
      }

      .hint {
        font-size: 0.82rem;
      }

      .otp-input,
      .composer-input,
      .primary-button,
      .secondary-button,
      .danger-button {
        width: 100%;
      }

      .otp-input,
      .composer-input {
        padding: 15px 18px;
        color: var(--text);
        background: color-mix(in oklab, var(--surface-soft) 88%, transparent);
      }

      .otp-input {
        font-family: "IBM Plex Mono", monospace;
        font-size: clamp(1.3rem, 8vw, 1.75rem);
        letter-spacing: 0.28em;
        text-align: center;
      }

      .composer-input {
        min-height: 11rem;
        border-radius: var(--radius-md);
        resize: vertical;
      }

      .otp-input::placeholder,
      .composer-input::placeholder {
        color: color-mix(in oklab, var(--muted) 78%, transparent);
      }

      .primary-button,
      .secondary-button,
      .danger-button {
        min-height: 3.25rem;
        padding: 0.9rem 1rem;
      }

      .primary-button {
        color: white;
        border-color: transparent;
        font-weight: 600;
        background: linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent) 58%, white));
      }

      .secondary-button {
        background: transparent;
        color: var(--text);
      }

      .danger-button {
        color: var(--danger);
        background: color-mix(in oklab, var(--danger) 10%, transparent);
        border-color: color-mix(in oklab, var(--danger) 34%, var(--line));
      }

      .primary-button:hover,
      .secondary-button:hover,
      .danger-button:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-soft);
      }

      .message {
        min-height: 1.5rem;
        font-size: 0.92rem;
      }

      .message--remote {
        padding: 0 4px 2px;
      }

      .message[data-tone="warn"] {
        color: var(--danger);
      }

      .message[data-tone="neutral"] {
        color: var(--muted);
      }

      .terminal-panel {
        overflow: hidden;
      }

      .terminal-header {
        padding: 16px 18px 10px;
        border-bottom: 1px solid var(--line);
      }

      .terminal-header h2 {
        font-size: clamp(1.35rem, 5vw, 2rem);
      }

      .terminal-note {
        font-size: 0.9rem;
      }

      .terminal-shell {
        min-height: clamp(19rem, 52vh, 38rem);
        padding: 6px;
        background: var(--terminal-bg);
      }

      .terminal-host {
        min-height: clamp(19rem, 52vh, 38rem);
      }

      .composer-panel {
        display: grid;
        gap: 14px;
      }

      .utility-row {
        gap: 12px;
      }

      .utility-row > * {
        flex: 1 1 0;
      }

      @media (min-width: 960px) {
        .chrome {
          flex-direction: row;
          justify-content: space-between;
          align-items: flex-end;
        }

        .auth-layout {
          grid-template-columns: minmax(0, 1fr) minmax(22rem, 0.82fr);
          align-items: stretch;
        }
      }

      @media (min-width: 1100px) {
        .remote-layout {
          grid-template-columns: minmax(0, 1.45fr) minmax(19rem, 0.78fr);
          align-items: start;
        }

        .composer-panel {
          position: sticky;
          top: 16px;
        }
      }

      @media (max-width: 719px) {
        main {
          padding:
            calc(10px + env(safe-area-inset-top))
            max(10px, env(safe-area-inset-right))
            calc(16px + env(safe-area-inset-bottom))
            max(10px, env(safe-area-inset-left));
        }

        .device-frame {
          padding: 10px;
          border-radius: 22px;
        }

        .brand-mark {
          width: 54px;
          height: 54px;
          border-radius: 18px;
          font-size: 1.05rem;
        }

        .hero-card,
        .form-card,
        .composer-panel {
          padding: 16px;
        }

        .utility-row {
          flex-direction: column;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="device-frame">
        <header class="chrome">
          <div class="brand-lockup">
              <div class="brand-mark">cdx</div>
            <div>
              <p class="eyebrow">원격 제어</p>
              <h1>손안의 Codex</h1>
            </div>
          </div>

          <div class="theme-switch" role="group" aria-label="Theme">
            <button class="theme-button" type="button" data-theme-button="modern-dark" data-active="true" aria-pressed="true">Modern Dark</button>
            <button class="theme-button" type="button" data-theme-button="sepia" data-active="false" aria-pressed="false">Sepia</button>
            <button class="theme-button" type="button" data-theme-button="teal" data-active="false" aria-pressed="false">Teal</button>
          </div>
        </header>

        <div class="session-rail" aria-label="Session">
          <div class="meta-pill"><strong>Profile</strong><span data-profile>${safeProfile}</span></div>
          <div class="meta-pill"><strong>Mode</strong><span data-mode>${safeMode}</span></div>
          <div class="status-pill" data-remote-status data-state="idle">연결 대기</div>
          <div class="status-pill" data-auth-status data-state="idle">인증 대기</div>
        </div>
        <p class="message message--remote" data-remote-message role="status" aria-live="polite"></p>

        <section class="step" data-step="auth" ${config.otpRequired ? "" : "hidden"}>
          <div class="auth-layout">
            <article class="hero-card">
              <div>
                <p class="eyebrow">보안 연결</p>
                <h2>6자리 코드로 바로 연결</h2>
              </div>
              <p class="copy">데스크톱에 표시된 코드를 입력하면 이 세션을 바로 제어할 수 있습니다.</p>
              <div class="hero-meta">
                <div class="meta-pill"><strong>Profile</strong><span>${safeProfile}</span></div>
                <div class="meta-pill"><strong>만료</strong><span>${safeExpiry}</span></div>
              </div>
            </article>

            <article class="form-card">
              <form data-otp-form>
                <div class="field-head">
                  <label class="field-label" for="otp">인증 코드</label>
                  <span class="hint">6자리</span>
                </div>
                <input
                  class="otp-input"
                  id="otp"
                  name="otp"
                  type="text"
                  data-otp-input
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  autocapitalize="off"
                  spellcheck="false"
                  maxlength="8"
                  placeholder="000000"
                />
                <button class="primary-button" type="submit">기기 확인</button>
              </form>
              <p class="message" data-auth-message role="status" aria-live="polite"></p>
            </article>
          </div>
        </section>

        <section class="step" data-step="remote" ${config.otpRequired ? "hidden" : ""}>
          <div class="remote-layout">
            <article class="terminal-panel">
              <div class="terminal-header">
                <div>
                  <p class="eyebrow">실시간 세션</p>
                  <h2>작업 중인 터미널</h2>
                </div>
                <p class="terminal-note">상태와 출력은 자동으로 갱신됩니다.</p>
              </div>
              <div class="terminal-shell">
                <div class="terminal-host" data-terminal></div>
              </div>
            </article>

            <article class="composer-panel">
              <form data-prompt-form>
                <div class="field-head">
                  <label class="field-label" for="prompt">프롬프트</label>
                  <span class="hint">Ctrl / Cmd + Enter</span>
                </div>
                <textarea
                  class="composer-input"
                  id="prompt"
                  name="prompt"
                  data-prompt-input
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  placeholder="Codex에 보낼 프롬프트…"
                ></textarea>
                <button class="primary-button" type="submit" data-prompt-button>프롬프트 보내기</button>
              </form>

              <div class="utility-row">
                <button class="danger-button" type="button" data-interrupt-button>중단</button>
                <button class="secondary-button" type="button" data-reconnect-button>재연결</button>
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
    <script>${buildClientScript(config)}</script>
  </body>
</html>`;
}
