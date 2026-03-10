 # cdx Run Upgrade Plan: Multi-Account-Aware Run Defaults, Quota Guard, and Continuity Handoff

  ## Summary

  이번 업그레이드는 cdx의 메인 포지셔닝을 유지합니다. 중심 가치는 끝까지 multi-account switching이고, cdx run은 그 가치를 가장 직접
  적으로 드러내는 진입점으로 강화합니다.

  사용자 불편의 핵심은 이렇습니다.

  - 지금 어떤 계정/플랜/usage 상태로 실행되는지 불명확함
  - quota가 낮은 계정으로 실수로 실행하기 쉬움
  - auth/quota 문제로 중단되면 다른 계정으로 자연스럽게 이어가기 어려움

  이에 맞춰 cdx run에 설정 저장, preflight 확인, quota 경고, 수동 계정 전환 제안, context handoff 기반 이어받기를 추가합니다. 웹 대
  시보드는 이번 범위에서 제외하고 CLI 우선으로 구현합니다.

  ## Key Changes

  ### 1. cdx run 진입 흐름 재설계

  cdx run [profile] [codex args...]는 아래 순서로 동작합니다.

  1. profile 결정
  2. 실행 모드 결정
      - profile 기본값 우선
      - 없으면 전역 기본값
      - 둘 다 없으면 첫 실행 인터랙션으로 선택 후 전역 기본값 저장
  3. usage 조회
  4. preflight 출력
      - 현재 프로필
      - 현재 실행 모드
      - quota 상태
      - 전환 후보
      - auth 상태
  5. quota 경고
      - 5시간 한도 또는 주간 한도 중 하나라도 <= 5%면 경고
      - 계속 진행 / 다른 계정 선택 중 하나를 고르게 함
  6. 사용자가 확인하면 cdx 내부 모드를 실제 Codex 플래그로 매핑해 실행

  preflight는 기본적으로 항상 표시합니다. 목적은 "내가 지금 어느 계정으로 어떤 위험도로 실행하는지"를 숨기지 않는 것입니다.

  ### 2. cdx 내부 실행 모드 도입

  공개 UX는 Codex의 비공식적 표현을 그대로 드러내지 않고, cdx의 내부 모드 개념으로 고정합니다.

  공개 모드 라벨:

  - safe
  - balanced
  - yolo

  기본 매핑:

  - safe → -s read-only + -a untrusted
  - balanced → --full-auto
  - yolo → --dangerously-bypass-approvals-and-sandbox

  구현 원칙:

  - README/CLI/help에서는 "cdx mode"로 설명
  - Codex 플래그는 내부 매핑으로만 사용
  - 사용자가 직접 Codex 플래그를 cdx run 뒤에 넘긴 경우:
      - cdx mode에서 유도되는 충돌 플래그와 함께 쓰지 못하게 막고 명시적 오류를 반환
      - 목적은 precedence 혼란 제거

  ### 3. 설정 저장 모델 추가

  새 전역 설정 파일을 추가합니다.

  - 기본 경로: ~/.cdx/config.json

  새 데이터 구조:

  - 전역 기본 실행 모드
  - profile별 기본 실행 모드
  - low quota 시 우선 제안할 profile 선호도
  - continuity handoff 관련 최근 세션 메타데이터

  프로필별 설정은 각 profile 홈 내부가 아니라 중앙 전역 설정 파일에서 관리합니다.
  이유:

  - legacy profile도 같은 방식으로 다룰 수 있음
  - 설정 검색 우선순위가 단순함
  - run UX와 recommendation state를 한 곳에서 관리 가능

  우선순위:

  1. cdx run --mode ... 같은 명시 입력이 있으면 최우선
  2. profile별 기본값
  3. 전역 기본값
  4. 아무것도 없으면 첫 실행 질문 후 전역 기본값 저장

  ### 4. 새 CLI 표면 추가

  이번 구현에 필요한 공개 명령/옵션:

  - cdx run [profile] [codex args...] [--mode <safe|balanced|yolo>]
  - cdx mode
    현재 전역/프로필 기본 모드 확인
  - cdx mode set <safe|balanced|yolo>
    전역 기본 실행 모드 설정
  - cdx mode set <safe|balanced|yolo> --profile <profile>
    특정 profile 기본 실행 모드 설정

  추천 전환 대상 관련 UX:

  - low quota 시 전환 가능한 다른 profiles를 번호 목록으로 출력
  - 추천 우선순위는 저장된 선호 profile을 먼저 보여주고, 나머지는 usage 여유가 큰 순서로 정렬
  - 자동 전환은 절대 하지 않음

  선호 저장 UX:

  - 사용자가 전환해 실행한 뒤 다음에도 이 계정을 먼저 제안할까요?를 묻고 저장 가능
  - 저장 값은 "low quota 시 추천 우선순위" 용도만 가짐
  - 강제 default profile처럼 쓰지 않음

  ### 5. auth / quota / candidate 판정 규칙

  Preflight에 표시할 상태 정의:

  - 현재 프로필
      - profile id
      - email
      - plan
  - 실행 모드
      - safe|balanced|yolo
  - quota 상태
      - 5h left, weekly left, reset 시각
      - 조회 실패 시 "unknown" + 실패 이유
  - 전환 후보
      - 현재 프로필 제외
      - auth가 있는 프로필만 우선 후보
      - usage 조회 성공 + 남은 양 높은 순으로 추천
      - 추천 선호 저장이 있으면 해당 profile을 최상단
  - auth 상태
      - ready
      - missing
      - stale/unknown 같은 단순 상태 문자열

  Quota 경고 조건:

  - fiveHourLeft <= 5 또는 weeklyLeft <= 5
  - 둘 다 unknown이면 경고는 띄우지 않고 "quota unknown"만 표기
  - 하나만 known이면 known 값 기준으로 판단

  ### 6. continuity handoff 기반 이어받기

  완전한 Codex 세션 내부 상태 승계는 하지 않습니다.
  대신 새 profile로 새 세션을 시작하면서 continuity payload를 초기 prompt로 주입합니다.

  저장할 최근 실행 메타데이터:

  - profile id
  - cwd
  - startedAt / failedAt
  - failure reason
  - recent transcript excerpt
  - 최근 stdout/stderr 요약
  - 직전 작업 요약 문자열

  이어받기 UX:

  - quota/auth 문제로 run이 실패/중단되면
      - 다른 profile로 이어서 시작할지 제안
  - 사용자가 profile을 고르면
      - 새 Codex interactive run 시작
      - 초기 prompt 앞부분에 handoff block 삽입
  - handoff block 내용:
      - 이전 profile
      - 이전 실패 이유
      - 작업 디렉터리
      - 최근 작업 요약
      - transcript excerpt
      - "continue from this context" 지시문

  최근 transcript는 전체가 아니라 길이 제한된 excerpt만 전달합니다.
  목표는 continuity이지, 세션 복제나 resume emulation이 아닙니다.

  ## Implementation Changes

  ### CLI / control flow

  - handleRun을 단순 passthrough에서 orchestration 흐름으로 교체
  - 기존 prompt() 기반 인터랙션을 확장해:
      - single-choice selection
      - yes/no confirm
      - mode selection
      - candidate profile selection
        을 지원하는 경량 터미널 유틸 추가

  ### Config / state layer

  - 새 config loader/saver 추가
  - ~/.cdx/config.json read/write 유틸 추가
  - schema는 단순 JSON 구조로 유지
  - malformed config면 경고 후 safe fallback 사용
  - profile 삭제 시 관련 profile-specific defaults / preference / handoff metadata 정리

  ### Run execution layer

  - runCodex(profile, args, cwd) 호출 전 mode-to-flags 변환 수행
  - low quota warning 및 alternate profile picker 삽입


  - cdx help에 mode 명령군 추가
  - README에:
      - first-run mode setup
      - low quota warning
      - account switch suggestion
      - continuity handoff
        예시 추가
  - 제품 메시지는 그대로 multi-account 중심 유지

  ## Test Plan

  ### Core run behavior

  - 첫 cdx run에서 mode 선택을 묻고 전역 기본값이 저장돼야 함
  - 이후 cdx run은 저장된 기본값으로 바로 진행해야 함
  - profile별 기본값이 있으면 전역값보다 우선해야 함
  - --mode가 있으면 저장값보다 우선해야 함

  ### Quota guard

  - 5h 또는 weekly 중 하나라도 <= 5%면 경고가 떠야 함
  - 경고 후 "계속 진행"과 "다른 계정 선택" 둘 다 정상 동작해야 함
  - 추천 candidate 목록이 현재 profile 제외 + auth 가능 profiles 위주로 보여야 함
  - 저장된 선호 candidate가 있으면 목록 최상단에 와야 함

  ### Preflight

  - preflight에 현재 프로필, 모드, quota 상태, 후보, auth 상태가 항상 포함돼야 함
  - quota 조회 실패 시 실행이 막히지 않고 상태만 unknown으로 보여야 함
  - auth 없음/오래됨 상태가 구분되어 출력돼야 함

  ### Continuity handoff

  - quota/auth 실패 후 다른 profile로 새 run을 시작할 때 handoff prompt가 주입돼야 함
  - handoff에는 cwd, failure reason, recent transcript excerpt, 작업 요약이 포함돼야 함
  - transcript가 너무 길면 잘린 excerpt만 전달돼야 함
  - handoff는 same-process resume가 아니라 fresh run임을 일관되게 유지해야 함

  ### Regression / compatibility

  - 기존 cdx run profile -- <codex args> 스타일 사용자는 mode 기능 없이도 계속 실행 가능해야 함
  - legacy profiles도 동일하게 기본 mode 적용과 quota 판정이 가능해야 함
  - usage 조회 실패가 cdx run 전체 실패로 번지지 않도록 해야 함

  ## Assumptions

  - 이번 범위는 CLI first
  - preflight는 기본적으로 항상 표시
  - safe|balanced|yolo는 cdx 내부 라벨로 유지
  - mode 매핑은 고정:
      - safe = read-only + untrusted
      - balanced = full-auto
      - yolo = bypass approvals/sandbox
  - low quota 경고 기준은 5h 또는 weekly 중 하나라도 <= 5%
  - 이어받기는 Codex native resume가 아니라 fresh run + context handoff
  - 추천 profile 자동 전환은 하지 않음
