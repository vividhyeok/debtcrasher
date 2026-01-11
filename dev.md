# DebtCrasher 개발 문서 (현재 상태)

DebtCrasher는 **Layer A(Structured Log)**와 **Layer B(Narrative Report)**로 분리된 VS Code 확장입니다. 개발 히스토리를 로그로 모으고, 단일 LLM 호출로 추론 JSON을 만든 뒤 TypeScript 템플릿으로 한국어 학습지 스타일 리포트를 렌더링합니다.

## 1. 아키텍처 개요

- **Layer A – Structured Log** ([src/logging.ts](src/logging.ts))
  - JSONL로 모든 이벤트 기록: `file_save`, `decision`, `bugfix`, `ai_note`, `llm_call`
  - 파일 저장 시 diff 기반 added/removed 계산, Git 브랜치 포함
  - 로그 저장 위치: `.devcrasher/logs/YYYY-MM-DD-N.log`

- **Layer B – Narrative Report** ([src/report.ts](src/report.ts))
  - 로그를 읽어 단일 LLM reasoning JSON을 생성 후, TS 템플릿으로 "상세하고 친절한 한국어 학습지" 스타일 리포트 렌더링
  - 결과 Markdown을 `.devcrasher/reports/report.md`로 저장, Webview 렌더
  - HTML 내보내기 지원(브라우저 인쇄로 PDF 저장 가능)

## 2. 주요 기능

1) **자동 로깅**
- `onDidSaveTextDocument` 시 diff 계산 후 `file_save` 이벤트 기록
- 불필요한 경로(.git 등) 무시

2) **수동 메모 이벤트**
- `decision`, `bugfix` 명령으로 사용자 메모 기록 (위치/브랜치 포함)

3) **AI 노트 (단일 호출)**
- `debtcrasher.generateAiNote`
- 현재 파일 diff/최근 저장 이력 기반으로 AI가 `ai_note` JSON 생성

4) **리포트 생성 (단일 reasoning 파이프라인)**
- 명령: `debtcrasher.openReport`
- 흐름: BaseBlock 배열 구성 → LLM Reasoning(JSON 생성) → TypeScript 템플릿(상세 Markdown 렌더)
- 특징: Notion 스타일 UI, 풍부한 한국어 설명, 이모지 활용, HTML/PDF 저장 지원

## 3. 설정 (VS Code Settings)

- **Provider API Key (공통)**
  - `debtcrasher.providers.openai.apiKey`
  - `debtcrasher.providers.gemini.apiKey`
  - `debtcrasher.providers.deepseek.apiKey`

- **AI Note (저비용 단일 호출)**
  - `debtcrasher.note.provider` (openai | gemini | deepseek)
  - `debtcrasher.note.model` (기본: gpt-4o-mini)

- **Report (Single Reasoning 파이프라인)**
  - `debtcrasher.report.provider`
  - `debtcrasher.report.reasoningModel` (비우면 기본: openai gpt-4o / gemini-1.5-pro / deepseek-chat)

- **자동 생성**
  - `debtcrasher.autoGenerateOnSave` (저장 시 AI 노트 자동 생성)

## 4. LLM 파이프라인 상세

- 입력: 정렬된 로그 이벤트(`file_save`, `decision`, `bugfix`, `ai_note`)
- BaseBlock 생성: 시간/파일/요약/리스크/다음단계 등 최소 메타만 추출 후 필터링
- **Reasoning 단계** ([src/aiClient.ts](src/aiClient.ts))
  - Prompt: `REPORT_REASONING_PROMPT` (엄격한 JSON 스키마, 한국어 사고 과정 유도)
  - 모델: `report.reasoningModel` (Reasoning에 특화된 고성능 모델 권장)
  - 출력: `ReasoningJson.blocks[]` (의도, 문제 배경, 대안 비교, 개념 함정, 트레이드오프 등 심층 분석 데이터)
- **Markdown 렌더** ([src/report.ts](src/report.ts))
  - TypeScript 템플릿 엔진 사용: LLM이 생성한 JSON 데이터를 기반으로 "친절하고 상세한 한국어 학습지" 스타일로 변환
  - 특징: 
    - 번호 매기기(1, 2, 3...)를 통한 구조화된 서술
    - '왜 선택했나요?', '대안 비교', '개념 주의점' 등 교육적 가치 강조
    - 전체 요약 섹션 및 액션 가능한 체크리스트 포함
- 에러 처리: API Key 부재 또는 JSON 파싱 실패 시 VS Code 알림 표시

## 5. 데이터 스키마 (주요 이벤트)

- `file_save`: `{ addedLines, removedLines, filePath, languageId, branch }`
- `decision` / `bugfix`: `{ note, filePath?, line?, branch }`
- `ai_note`: `{ workType, mainGoal, changeSummary, importantFunctions[], risks?, nextSteps? }`
- `llm_call`: `{ tool, argsSummary }` (미래 확장용)

## 6. 코드베이스 요약

| 파일 | 역할 |
| :--- | :--- |
| [src/extension.ts](src/extension.ts) | 명령/이벤트 진입점, 설정 로드, 리포트/AI 노트 실행 흐름 |
| [src/logging.ts](src/logging.ts) | Layer A: 로그 캡처, diff 계산, JSONL 저장 |
| [src/aiClient.ts](src/aiClient.ts) | LLM 호출 추상화: reasoning JSON 생성, 프로바이더별 REST 호출/프롬프트 |
| [src/report.ts](src/report.ts) | Layer B: 로그 로드 → BaseBlock 생성 → reasoning 호출 → 템플릿 Markdown/HTML 생성 |
| [src/webview.ts](src/webview.ts) | Webview 렌더, Notion 스타일 UI, Export 버튼(HTML 저장 후 인쇄) |

## 7. 사용 흐름 (요약)

1) 파일 저장 → `file_save` 로그 자동 기록
2) 필요 시 `decision` / `bugfix` / `generateAiNote` 실행 → 로그 축적
3) `openReport` 실행 → reasoning JSON(단일 LLM) → Markdown 생성 → Webview/HTML 출력

---
*Last Updated: 2026-01-12*
