<div align="center">
  <a href="./README.md">English</a> |
  <a href="./README.ko.md">한국어</a> |
  <a href="./README.zh-CN.md">简体中文</a> |
  <a href="./README.ja.md">日本語</a> |
  <a href="./README.es.md">Español</a>
</div>

# <div align="center">cdx</div>

<div align="center">
  <strong>여러 Codex 계정을 운용하는 사람을 위한 로컬 우선 컨트롤 플레인.</strong>
</div>

<div align="center">
  올바른 프로필로 Codex를 실행하고, 인증 파일을 뒤지지 않고 사용량을 확인하고,
  하나의 대시보드에서 공유 <code>AGENTS.md</code> 연결 상태를 관리할 수 있습니다.
</div>

<br />

<div align="center">
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-111111?style=for-the-badge&logo=node.js&logoColor=5FA04E" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-111111?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-111111?style=for-the-badge&logo=vite&logoColor=646CFF" />
  <img alt="Platforms" src="https://img.shields.io/badge/Linux%20%26%20macOS-supported-111111?style=for-the-badge" />
</div>

<br />

<div align="center">
  <a href="#빠른-시작"><img alt="Quick Start" src="https://img.shields.io/badge/Quick%20Start-18181B?style=flat-square&logo=rocket&logoColor=white" /></a>
  <a href="#명령어-레퍼런스"><img alt="CLI" src="https://img.shields.io/badge/CLI-18181B?style=flat-square&logo=gnubash&logoColor=white" /></a>
  <a href="#대시보드-동작-방식"><img alt="Dashboard" src="https://img.shields.io/badge/Dashboard-18181B?style=flat-square&logo=react&logoColor=61DAFB" /></a>
  <a href="#로드맵-방향"><img alt="Roadmap" src="https://img.shields.io/badge/Roadmap-18181B?style=flat-square&logo=github&logoColor=white" /></a>
</div>

<div align="center">
  <sub>로컬 우선. 프로필 인지형. alias와 메모보다 운영 가시성이 필요한 Codex 사용자용 도구.</sub>
</div>

## 하이라이트

| 프로필 기반 실행 | 사용량 가시성 | 공유 AGENTS 연결 | 로컬 대시보드 |
| --- | --- | --- | --- |
| 항상 올바른 `CODEX_HOME`으로 `codex` 실행 | 인증 파일을 직접 열지 않고 실사용량 확인 | 여러 저장소에서 하나의 `AGENTS.md` 연결 관리 | 완전한 터미널이 필요 없는 작업은 브라우저에서 처리 |

## 대표 사용 흐름

| 상황 | cdx가 도와주는 일 |
| --- | --- |
| 개인용 계정과 업무용 계정을 함께 쓰는 1인 개발자 | 환경 변수를 수동으로 바꾸지 않고 프로필을 깔끔하게 전환 |
| 여러 Codex 홈을 관리하는 팀 리드 | 누가 로그인되어 있는지, 어떤 플랜인지, 어떤 프로필이 한도에 가까운지 빠르게 확인 |
| 여러 저장소를 운영하는 환경 | 저장소마다 반복 설정하지 않고 하나의 공유 `AGENTS.md` 재사용 |
| 브라우저 중심 운영 | 터미널에만 의존하지 않고 run, login, doctor 갱신 같은 공통 작업 처리 |

## 아키텍처 한눈에 보기

```text
레거시 홈 (~/.codex, ~/.codex2, ...)
            +
현대식 홈 (~/.cdx/profiles/*)
            |
            v
      cdx 프로필 탐색
            |
            +-------------------+
            |                   |
            v                   v
        CLI 명령           Vite 로컬 API
            |                   |
            +---------+---------+
                      |
                      v
  공용 액션: run / usage / login / logout /
  doctor / agents / profile 관리
                      |
                      v
          Codex CLI + 로컬 대시보드
```

## 이런 상황에 맞습니다

- 한 머신에서 두 개 이상의 Codex 계정을 운용할 때
- 긴 세션을 시작하기 전에 계정 상태와 사용량을 먼저 보고 싶을 때
- 자주 쓰는 작업에 대해 가벼운 브라우저 제어면을 원할 때
- 임시 스크립트 대신 저장소 전반에 공유 `AGENTS.md` 동작을 일관되게 적용하고 싶을 때

## 왜 cdx인가

대부분의 Codex 멀티 계정 환경은 셸 alias, 복제된 설정 폴더, 그리고 어떤 계정이 어디에 로그인되어 있는지 적어둔 메모로 시작합니다.
`cdx`는 그 상태를 명시적인 워크플로로 바꿉니다.

- 프로필 인지형 `codex` 실행
- 계정 상태와 사용량을 한 곳에서 확인
- 여러 저장소에 걸친 공유 `AGENTS.md` 관리
- 전체 터미널이 필요 없는 작업을 위한 브라우저 대시보드

## 현재 제공 기능

### CLI

- `cdx run [profile] [codex args...]`
- `cdx usage [profile] [--json]`
- `cdx agents edit --global`
- `cdx agents status`
- `cdx ls`
- `cdx whoami [profile]`
- `cdx login <profile>`
- `cdx logout <profile>`
- `cdx create <profile>`
- `cdx rm <profile> [--force]`
- `cdx doctor`

### 웹 대시보드

- 프로필, 실시간 사용량, AGENTS 연결 상태, doctor 상태 개요
- Codex 세션 시작용 run picker
- 프로필 생성
- 로그인과 로그아웃 세션 시작
- 상태 폴링이 포함된 run 세션 시작
- doctor 새로고침
- 공유 `AGENTS.md` 준비

## 기능 맵

| 영역 | 현재 포함된 기능 |
| --- | --- |
| 프로필 수명주기 | 생성, 목록 조회, 상세 확인, 제거 |
| 계정 접근 | 로그인, 로그아웃, 인증 메타데이터 확인 |
| 사용량 운영 | 실시간 사용량 조회, 단일/다중 프로필 보기 |
| 저장소 편의성 | 전역 AGENTS 준비, 상태 점검 |
| 세션 제어 | 대시보드에서 Codex run 시작 및 액션 상태 폴링 |

## 빠른 시작

### 요구 사항

- Node.js 20+
- `PATH`에 `codex` 존재
- Linux 또는 macOS

### 설치

```bash
npm install
npm run build
```

### 대시보드 실행

```bash
npm run dev
```

이 명령은 Vite UI와 대시보드가 사용하는 로컬 API 레이어를 함께 실행합니다.

### CLI 실행

```bash
node dist-cli/index.js --help
```

개발 중 로컬 명령으로 쓰고 싶다면:

```bash
npm link
cdx doctor
```

## 첫 실행 흐름

```bash
cdx create work
cdx login work
cdx usage work
cdx run work
```

이미 여러 Codex 홈을 쓰고 있다면 `~/.codex`, `~/.codex2` 같은 레거시 프로필도 찾아낼 수 있습니다.

## 명령어 레퍼런스

| 명령어 | 설명 |
| --- | --- |
| `cdx run [profile] [codex args...]` | 선택한 프로필의 `CODEX_HOME`으로 `codex` 실행 |
| `cdx usage [profile] [--json]` | 한 프로필 또는 전체 프로필의 사용량 조회 |
| `cdx agents edit --global` | 공유 전역 `AGENTS.md`를 준비하고 열기 |
| `cdx agents status` | 프로젝트와 전역 AGENTS 연결 상태 표시 |
| `cdx ls` | 탐지된 프로필 목록 표시 |
| `cdx whoami [profile]` | 프로필의 계정 메타데이터 표시 |
| `cdx login <profile>` | 프로필 로그인 흐름 시작 |
| `cdx logout <profile>` | 프로필 로그아웃 흐름 시작 |
| `cdx create <profile>` | `~/.cdx/profiles` 아래에 현대식 프로필 생성 |
| `cdx rm <profile> [--force]` | 프로필 제거 |
| `cdx doctor` | 환경 및 설정 점검 실행 |

## 대시보드 동작 방식

웹 UI는 별도 백엔드 서비스가 아닙니다. 개발과 프리뷰 환경에서 Vite 서버가 CLI와 동일한 프로필/액션 로직을 호출하는 로컬 엔드포인트를 노출합니다.

- `GET /api/dashboard` 프로필, 사용량, AGENTS 상태, doctor 힌트 집계
- `POST /api/run-sessions` 프로필 기반 Codex run 시작
- `POST /api/login-sessions` 로그인 흐름 시작
- `POST /api/profiles/:id/logout` 로그아웃 흐름 시작
- `GET /api/action-sessions/:id` 세션 진행 상태 폴링
- `POST /api/agents/global-file` 공유 전역 `AGENTS.md` 준비

즉, 별도 호스팅 제어 평면 없이 로컬 우선으로 동작하며, CLI와 브라우저 사이에 비즈니스 로직을 중복 구현하지 않습니다.

## 사용량 데이터 소스

`cdx usage`와 대시보드는 각 프로필의 저장된 인증 상태를 사용해 ChatGPT 백엔드 usage 엔드포인트에서 주로 데이터를 읽습니다.
기존 `/status` 스크래핑 경로도 호환성을 위해 남아 있지만, 주 경로는 아닙니다.

## 현재 한계

- 웹 UI는 아직 완전한 인터랙티브 터미널을 제공하지 않음
- 긴 Codex 작업은 여전히 브라우저보다 실제 터미널이 더 적합함
- `agents edit --global`은 현재 파일을 준비하고 로컬 편집기를 여는 방식이며, 브라우저 내 편집기는 아님
- Windows 지원은 아직 미완성
- 레거시 `/status` 경로 일부는 Windows에서 제공되지 않는 터미널 도구에 의존함

## 개발

```bash
npm run typecheck
npm run lint
npm run build
```

빌드된 CLI 엔트리포인트:

```bash
node dist-cli/index.js --help
```

## 로드맵 방향

- 멀티 계정 운영 가시성 강화
- 대시보드 세션 모니터링 강화
- 터미널 비중이 낮은 사용자를 위한 프로필 온보딩 개선
- 저장소 간 AGENTS 설정 자동화 확대

## 디자인 의도

대시보드는 일반적인 관리자 UI보다 운영 도구다운 따뜻한 감각을 의도했습니다.
집중된 Codex 사이드카처럼 느껴지도록 설계했습니다.

- `cdx run`
- `cdx usage`
- `cdx agents edit --global`
- `cdx doctor`
