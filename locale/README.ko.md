<div align="center">
  <a href="../README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.es.md">Español</a>
</div>

# cdx

**Codex를 더 편하게, 모바일에서도.**

<div align="center">
  <img src="../assets/social-preview.png" alt="cdx social preview" width="100%" />
</div>


## 빠르게 시작하기

### 요구 사항

- Node.js 20+
- Codex 설치 완료 `npm install -g @openai/codex`
- `cloudflared` 설치 필요
- Linux, macOS 지원

### 설치

```bash
npm install -g @ezpzai/cdx
```

### Cloudflare Quick Tunnel 설치

`cdx remote`는 기본적으로 Cloudflare Quick Tunnel을 사용합니다.

* https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads


macOS:

```bash
brew install cloudflared
```

Linux:

```bash
curl -Lo cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

### 첫 실행

```bash
cdx login {프로필명} // 최초 등록 필요
cdx run {프로필명}
cdx remote // 모바일 실행
cdx usage // 사용량 확인
```

처음 인터랙티브한 Codex 명령을 실행하면 `cdx`가 세션 저장 방식을 먼저 물어봅니다.

- `global`: 발견된 Codex 홈을 즉시 스캔해 세션을 `~/.cdx/sessions`로 병합합니다
- `profile`: 각 프로필의 `CODEX_HOME/sessions`를 따로 유지합니다

## 주요 명령

| 명령 | 설명 |
| --- | --- |
| `cdx remote [profile] [codex args...] [--mode <safe\|balanced\|yolo>] [--tunnel <cloudflare\|none>] [--no-qr] [--lan]` | 데스크톱에서 실행한 Codex 세션을 모바일 웹으로 이어 붙입니다. |
| `cdx run [profile] [codex args...] [--mode <safe\|balanced\|yolo>]` | 선택한 프로필의 `CODEX_HOME`으로 Codex를 실행합니다. |
| `cdx usage [profile] [--json]` | 프로필별 auth 및 quota 상태를 확인합니다. |
| `cdx mode` | 현재 기본 실행 모드를 확인합니다. |
| `cdx mode set <safe\|balanced\|yolo> [--profile <profile>]` | 전역 또는 프로필별 기본 실행 모드를 저장합니다. |
| `cdx login <profile>` | 새 프로필을 만들거나 기존 프로필로 로그인합니다. |
| `cdx logout <profile>` | 프로필 로그아웃을 시작합니다. |
| `cdx ls` | 감지된 프로필 목록을 보여줍니다. |
| `cdx rm <profile> [--force]` | 프로필을 삭제합니다. |
| `cdx session [status]` | 세션 저장 모드를 확인하거나 인터랙티브하게 변경합니다. 기본값: 전역 `~/.cdx/sessions`. |
| `cdx agents edit --global` | 공통 전역 `AGENTS.md`를 준비하고 엽니다. |
| `cdx agents status` | 현재 저장소와 전역 `AGENTS.md` 연결 상태를 확인합니다. |

`cdx remote`의 기본 외부 경로는 `Cloudflare Quick Tunnel` 을 사용합니다.

- 외부 링크: `cdx remote <profile>`
- 같은 Wi-Fi / LAN: `cdx remote <profile> --tunnel none --lan`
- 로컬 전용: `cdx remote <profile> --tunnel none`

릴리스 이력은 GitHub Releases에서 확인할 수 있습니다.

- https://github.com/ezpzai/cdx/releases
