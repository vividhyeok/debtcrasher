# DebtCrasher 프로젝트 분석 및 구조 가이드

DebtCrasher는 개발 과정에서의 기술적 결정, 버그 수정, 그리고 파일 변경 이력을 자동으로 캡처하여 서사적인 보고서로 만들어주는 VS Code 확장 프로그램입니다.

## 1. 프로젝트 개요
- **목적**: 개발 부채 관리 및 개발 히스토리의 시각화.
- **주요 기능**:
  - 파일 저장 시 변경된 라인 수(Diff) 자동 기록.
  - 사용자의 의사결정(Decision) 및 버그 수정(Bugfix) 메모 기록.
  - 저장된 로그를 바탕으로 요약 Markdown 보고서 생성 및 웹뷰 출력.

## 2. 기술 스택
- **언어**: TypeScript
- **플랫폼**: VS Code Extension API
- **라이브러리**:
  - `diff`: 파일 변경 사항 계산.
  - `React` & `marked`: 웹뷰 내 보고서 렌더링 (CDN 사용).
- **데이터 저장**: 로컬 파일 시스템 (`.devcrasher/` 폴더 내 JSON Line 형식 로그).

## 3. 디렉토리 구조 및 파일 역할

```
/src
  ├── extension.ts  # 확장의 진입점, 명령 등록 및 이벤트 리스너 설정
  ├── logging.ts    # 로그 캡처, 디프 계산, 파일 저장 로직 전문
  ├── report.ts     # 저장된 로그를 읽어 Markdown 형식으로 집계 및 생성
  └── webview.ts    # 생성된 보고서를 VS Code 웹뷰 패널로 렌더링
```

### 각 파일 상세 설명

#### [src/extension.ts](src/extension.ts)
- `activate()` 함수에서 확장을 초기화합니다.
- **명령 등록**:
  - `debtcrasher.recordDecision`: 사용자 입력을 받아 결정 사항 기록.
  - `debtcrasher.recordBugfix`: 사용자 입력을 받아 버그 수정 사항 기록.
  - `debtcrasher.openReport`: 보고서를 생성하고 웹뷰로 표시.
- **이벤트 구독**:
  - `onDidSaveTextDocument`: 파일 저장 시 변경 사항을 계산하여 로그에 추가.
  - `onDidOpenTextDocument`: 파일이 열릴 때 초기 상태를 메모리에 캐싱하여 정확한 Diff 계산 준비.

#### [src/logging.ts](src/logging.ts)
- **로그 스토리지**: 워크스페이스 루트의 `.devcrasher/logs/YYYY-MM-DD.log` 경로에 저장됩니다.
- **Diff 메커니즘**: `lastSavedContent` Map을 사용하여 메모리에 이전 파일 상태를 유지하고, `diffLines` 라이브러리를 통해 추가/삭제된 라인 수를 계산합니다.
- **로그 회전**: 하나의 로그 파일이 5MB를 초과하면 새로운 인덱스(예: `-2.log`)를 생성하여 저장합니다.
- **Git 연동**: 현재 작업 중인 브랜치 정보를 로그에 함께 기록합니다.

#### [src/report.ts](src/report.ts)
- `.devcrasher/logs/` 내의 모든 로그 파일을 읽어들입니다.
- 로그 데이터를 `timeline` (파일 저장), `decisions`, `bugfixes` 세 가지 카테고리로 분류합니다.
- 이를 결합하여 하나의 통합 Markdown 문서를 생성하고 `.devcrasher/reports/report.md`에 저장합니다.

#### [src/webview.ts](src/webview.ts)
- `vscode.window.createWebviewPanel`을 사용하여 독립된 보고서 창을 띄웁니다.
- `marked.js`를 사용하여 Markdown을 HTML로 변환합니다.
- `React`를 기반으로 간단한 툴바와 보고서 본문을 렌더링합니다.

## 4. 데이터 포맷 (Log Event)
각 로그 엔트리는 단일 JSON 객체로 한 줄씩 저장됩니다 (JSONL 형식).

```json
{
  "type": "file_save",
  "timestamp": "2026-01-10T...",
  "data": {
    "filePath": "src/main.ts",
    "addedLines": 5,
    "removedLines": 2,
    "branch": "master",
    "languageId": "typescript"
  }
}
```

## 5. 워크플로우 예시
1. 사용자가 파일을 열면 `logging.ts`가 파일 내용을 캐싱합니다.
2. 사용자가 수정 후 저장하면 `captureFileSaveEvent`가 실행되어 Diff 결과를 로그 파일에 추가합니다.
3. 사용자가 "Record Decision" 명령 실행 시 팝업에 입력한 텍스트가 로그에 기록됩니다.
4. "Open Report" 클릭 시 `report.ts`가 모든 과거 로그를 긁어 모아 요약본을 만들고 `webview.ts`가 이를 시각적으로 보여줍니다.

## 6. 향후 개선 사항 (참고용)
- 로그 데이터의 DB화 (SQLite 등).
- 리포트 내의 코드 조각(diff snippet) 포함 기능.
- 특정 기간별 리포트 필터링 기능.
- PDF 내보내기 기능 (UI에는 버튼이 있으나 현재 미구현).
