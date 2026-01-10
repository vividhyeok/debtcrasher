좋아. Notion API 관련 부분을 **완전히 제거**하고, PDF Export는 **WebView → HTML → PDF 변환이 가능할 때만 제공**,
만약 VS Code WebView 제약 때문에 안 된다면 “대체 출력 방식(HTML 다운로드)” 정도만 언급하는 형태로 깔끔히 다듬어서 다시 작성해줄게.

아래는 **최종 정제 버전의 README**야.
이번엔 Notion 관련 내용은 전부 제거했고, PDF Export는 WebView 중심으로만 설명함.

---

# DebtCrasher

**AI 코딩 시대의 개발 경험을
기억 부채(memory debt)에서 기록 자산(record asset)으로 전환하는 VS Code 확장**

---

## 개요

DebtCrasher는 GitHub Copilot, Claude Code, Gemini Code Assist 등
AI 기반 “바이브 코딩(vibe coding)” 환경에서 쉽게 사라지는
**개발 과정의 사고흐름 및 의사결정을 보존**하는 도구다.

AI가 코드를 빠르게 작성해주는 시대에는
“무엇을 만들었는가”보다
**“왜 그 선택을 했는가”**가 더 중요한 역량이 되지만,
현재 개발 환경은 이 과정을 자동으로 남겨주지 않는다.

* Git → 코드(결과물)는 보존
* AI 코딩 → 과정은 모두 휘발
* 개발자는 다음 프로젝트로 넘어가면서 **기억 부채(memory debt)** 증가

DebtCrasher는 이 과정을 두 개의 레이어로 나누어 해결한다:

* **Layer A – Structured Log Layer:**
  가장 간결하고 명료한 원시 개발 로그(JSON Lines)

* **Layer B – Narrative Report Layer:**
  Layer A 로그를 기반으로 사람이 읽기 좋은 리포트(Markdown, PDF)로 재구성

두 레이어는 역할만 분리되어 있으며,
MVP에서는 **두 레이어 모두 구현**한다.

---

## 설계 철학

### Layer A – Structured Log Layer

**기록의 미덕: 간결함, 명료함, 구조화, 오해의 여지 없음**

* “무엇을 했는지”를 기록한다
* 코드 전문은 저장하지 않는다
* 파일 저장, 의사결정, 버그해결, LLM 호출 등의 이벤트 중심
* JSON Lines 기반 → 용량 최소화, 장기 사용 안정성
* Git이 다루는 “결과물”이 아닌, Git이 남기지 못하는 “과정”을 캡처

### Layer B – Narrative Report Layer

**기록의 미덕: 충분한 설명, 흐름 중심의 서술, 읽히는 문서**

* Layer A 이벤트를 시간순으로 분석
* 개발자가 “왜 이런 설계를 했는지” 한눈에 볼 수 있게 정리
* 출력 형식:

  * Markdown 리포트
  * VS Code WebView(React)에서 렌더링
  * PDF Export (가능한 경우)

---

## 기능

### 1. 개발 행동 자동 기록 (Layer A)

#### 파일 저장 이벤트 감지

* VS Code API `onDidSaveTextDocument` 사용
* 파일 저장 시 자동 이벤트 생성
* 전체 파일을 저장하지 않고 아래 메타만 기록:

  * 파일 경로
  * 변경 라인 수 (추가/삭제)
  * 브랜치 정보
  * 타임스탬프

#### 의사결정/문제해결 메모

* Command Palette 메뉴 제공

  * `DebtCrasher: Record Decision`
  * `DebtCrasher: Record Bugfix`
* 한 줄 기록 → 이벤트로 저장
* 후에 리포트 생성 시 “이유/근거/대안” 복원 가능

#### LLM 도구 사용 흔적 기록 (CLI 래퍼)

* Claude/Copilot 패널을 읽지 않음
* 대신 터미널 기반 LLM CLI를 래퍼로 감시

  ```bash
  debt-llm claude "이 함수 개선해줘"
  ```
* 실행 인자 / 작업 디렉터리 / exit code만 저장
* 대화 전문은 저장하지 않음

#### JSON Lines 로그 + 로그 롤링

* 이벤트 1개 = JSON 1줄
* 장기 프로젝트에도 로그 크기 부담 없음
* 파일 크기 기준 자동 분할 (예: 5MB)

---

### 2. 리포트 생성 및 뷰어 (Layer B)

#### Markdown 리포트 생성

Layer A 로그를 기반으로 프로젝트의 “서사”를 재구성:

* 프로젝트 개요
* 기능 구현 흐름
* 의사결정 패턴
* 대안과 이유
* 문제 해결 과정 타임라인

출력 파일: `report.md`

#### VS Code Webview(React) 미리보기

* 명령: `DebtCrasher: Open Report`
* VS Code Webview에서 React 기반 리포트 뷰어 실행
* Markdown → React 렌더링
* 패드/A4 스타일 여백·폰트 적용
* 설정 파일로 테마 커스터마이징 가능

#### PDF Export

* Webview에서 “Export PDF” 실행
* Webview HTML을 PDF로 변환
* **만약 VS Code Webview 환경에서 PDF 변환이 제약될 경우**,
  대체 방식으로 HTML 다운로드 후 브라우저 인쇄 기능을 이용 가능
  (이 경우도 별도 플러그인 없이 바로 PDF 생성 가능)

---

## 저장 구조

```
.devcrasher/
    project-meta.json
    logs/
        2026-03-01.log
        2026-03-01-2.log
        2026-03-02.log
    reports/
        report.md
```

---

## 아키텍처

### VS Code Extension Host (백엔드)

* 파일 저장 감지
* 이벤트 JSONL 생성 및 쓰기
* CLI 래퍼와 통신
* 리포트 생성 모듈 실행
* Webview에 데이터 전달

### VS Code Webview (프론트엔드)

* React SPA
* 마크다운 렌더링
* A4 스타일 레이아웃 적용
* PDF Export 트리거 제공
* 설정 파일 기반 테마 커스터마이징

### 선택적 Node 모듈

* 마크다운 리포트 생성
* HTML/PDF 변환 등 무거운 작업 담당

---

## 설치 / 실행 (초안)

### 1. 리포지토리 클론

```
git clone https://github.com/yourname/DebtCrasher.git
cd DebtCrasher
```

### 2. 의존성 설치

```
yarn install
```

### 3. VS Code 확장 실행

* VS Code에서 프로젝트 열기
* `F5` 실행 → Extension Development Host

### 4. 사용

* Command Palette →

  * `DebtCrasher: Record Decision`
  * `DebtCrasher: Open Report`

---

## 로드맵

### v0.1 (MVP)

* 파일 저장 이벤트 → JSONL
* 의사결정/버그 메모
* LLM CLI 래퍼
* 로그 롤링
* Markdown 리포트 생성
* VS Code Webview 뷰어
* PDF Export (가능한 경우)

### v0.2

* PDF Export 안정화
* 레이아웃/폰트 테마 설정 강화
* 검색/필터 기능

### v1.0

* 프로젝트별 대시보드
* 심층 리포트(의사결정 분석/패턴 분류)
* 교육용 교재 자동 생성 지원

---

## 프로젝트 의의

AI 코딩이 당연한 시대에는
**“왜 그렇게 개발했는지 설명할 수 있는 능력”**이 실력이다.

Git은 코드 버전 관리를 완벽히 하지만,
AI가 주도한 개발 과정에서의
**의사결정, 시행착오, 문제 해결 흐름**은 보존되지 않는다.

DebtCrasher는 이 공백을 채우기 위해 설계되었다.

* Layer A는 **정제된 로그**
* Layer B는 **사람 친화적인 리포트**

결국 DebtCrasher는
바이브 코딩으로 만들어진 결과물을
**“내 경험이 담긴 나만의 참고서”**로 재구성하는 도구이다.
