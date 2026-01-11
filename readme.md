# 🎯 [1] README.md — 최종 공개용 설명서

아래는 깔끔한 “프로젝트 소개 + 설치 + 기능 요약” 중심의 README.md 초안이야.
노션 스타일로 읽기 쉽고, GitHub에서 보기 좋게 만들어져 있음.

---

# DebtCrasher

**Vibe Coding 시대의 개발 회고 자동화 도구**
개발 히스토리를 자동으로 수집하고, 단일 LLM Reasoning을 이용해 **한국어 학습지 스타일**의 구조화된 리포트를 생성하는 VS Code 확장입니다.

---

## ✨ 핵심 아이디어

Vibe Coding(빠른 개발, LLM Assisted Development)이 활성화되면서

* “왜 이 기술을 선택했는가?”
* “어떤 대안이 있었고 왜 버렸는가?”
* “문제는 무엇이었고 어떻게 해결했는가?”

같은 **의사결정 근거**가 빠르게 증발합니다.

➡️ DebtCrasher는 이 문제를 해결합니다.

---

## 🧱 아키텍처 (2-Layer)

### **Layer A – Structured Log**

* 저장 시 diff 기반 `file_save` 이벤트 자동 기록
* `decision`, `bugfix`, `ai_note` 등 수동/자동 맥락 이벤트 저장
* JSONL 포맷으로 `.devcrasher/logs/`에 저장
* “기억 부채 → 기록 부채”로 변환하는 단계

### **Layer B – Narrative Report**

* 모든 로그를 읽어 단일 LLM 호출로 **Reasoning JSON** 생성
* TypeScript 템플릿으로 **한국어 학습지 형태 Markdown** 생성
* Notion 스타일 Webview 미리보기
* HTML/PDF 내보내기 지원

---

## 🧩 주요 기능

| 기능             | 설명                                 |
| -------------- | ---------------------------------- |
| **자동 로깅**      | 파일 저장 시 Diff 기록, Git 브랜치 포함        |
| **AI Note 생성** | 현재 작업 맥락을 LLM이 JSON으로 구조화          |
| **수동 메모**      | decision / bugfix 메모               |
| **리포트 생성**     | Reasoning JSON → 학습지 Markdown 변환   |
| **PDF 내보내기**   | Webview → HTML → 브라우저 Print to PDF |

---

## ⚙️ 설정

```jsonc
{
  "debtcrasher.providers.openai.apiKey": "",
  "debtcrasher.providers.gemini.apiKey": "",
  "debtcrasher.providers.deepseek.apiKey": "",

  "debtcrasher.note.provider": "openai",
  "debtcrasher.note.model": "gpt-4o-mini",

  "debtcrasher.report.provider": "openai",
  "debtcrasher.report.reasoningModel": "gpt-4o"
}
```

---

## 📦 사용 흐름

1. 코드를 저장한다 → 자동으로 `file_save` 이벤트가 기록됨
2. 필요하면 `Record Decision` 또는 `Record Bugfix` 실행
3. 중요한 타이밍에 `Generate AI Note` 실행
4. 모든 작업이 끝나면 `Open Report` 실행
5. “친절한 한국어 학습지” 형식의 리포트가 생성됨
6. Webview에서 HTML/PDF로 내보내기 가능

---

## 🗂 코드 구조

```
/src
  extension.ts      // 명령/이벤트 진입점
  logging.ts        // Layer A: 로그 수집
  aiClient.ts       // LLM Reasoning JSON 생성
  report.ts         // Layer B: Markdown 템플릿 렌더링
  webview.ts        // Notion UI Webview
```
