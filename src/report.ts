import * as fs from "fs";
import * as path from "path";
import { ensureDirectories, readLogEvents, LogEvent } from "./logging";
import { AiProvider, BaseBlock, ReasoningJson, generateReportReasoning } from "./aiClient";

export type GeneratedReport = {
  markdown: string;
  reportPath: string;
};

export type ReportGenerationOptions = {
  provider: AiProvider;
  apiKey: string;
  reasoningModel: string;
};

// -------------------------------------------------------------------------
// Layer B - Narrative Report Layer
// Reconstructs the development story from the structured logs (Layer A).
// -------------------------------------------------------------------------

export async function generateReport(
  workspaceRoot: string,
  options: ReportGenerationOptions
): Promise<GeneratedReport> {
  const { reportsDir } = ensureDirectories(workspaceRoot);
  const events: LogEvent[] = readLogEvents(workspaceRoot);

  // Sort events by timestamp just in case
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const relevantEvents = events.filter(
    (event): event is LogEvent =>
      event.type === "file_save" ||
      event.type === "decision" ||
      event.type === "bugfix" ||
      event.type === "ai_note"
  );

  const now = new Date().toISOString();
  const header = [
    "# 📘 오늘의 개발 학습지 – DebtCrasher Report",
    "",
    `**생성일**: ${formatTimestamp(now)}`,
    "",
    "이번 개발 내용을 복습하는 학습지입니다. 시간순 타임라인을 따라 행동, 의도, 리스크, 다음 단계를 정리합니다.",
    ""
  ].join("\n");

  let timelineMarkdown = "";
  if (relevantEvents.length === 0) {
    timelineMarkdown = "기록된 이벤트가 없습니다. 새로운 개발 로그를 남겨보세요.";
  } else {
    const baseBlocks = relevantEvents
      .map((event) => toBaseBlock(event))
      .filter((block): block is BaseBlock => Boolean(block));

    if (!baseBlocks.length) {
      timelineMarkdown = "요약 블록을 생성하지 못했습니다. 로그 내용을 확인해 주세요.";
    } else {
      const reasoning = await generateReportReasoning(
        options.provider,
        options.apiKey,
        options.reasoningModel,
        baseBlocks
      );
      timelineMarkdown = renderReasoningToMarkdown(reasoning);
    }
  }

  const markdown = `${header}\n${timelineMarkdown.trim()}\n`;
  const reportPath = path.join(reportsDir, "report.md");
  fs.writeFileSync(reportPath, markdown, "utf8");

  return { markdown, reportPath };
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  // Format: YYYY-MM-DD HH:MM
  return date.toISOString().replace("T", " ").substring(0, 16);
}

function toBaseBlock(event: LogEvent): BaseBlock | null {
  const file = event.filePath ?? "project";
  const time = formatTimestamp(event.timestamp);

  if (event.type === "ai_note") {
    return {
      time,
      file,
      workType: event.workType,
      mainGoal: event.mainGoal,
      changeSummary: event.changeSummary,
      importantFunctions: event.importantFunctions,
      risks: event.risks,
      nextSteps: event.nextSteps
    };
  }

  if (event.type === "decision") {
    return {
      time,
      file,
      workType: "chore",
      mainGoal: "Decision memo",
      changeSummary: event.note
    };
  }

  if (event.type === "bugfix") {
    return {
      time,
      file,
      workType: "bugfix",
      mainGoal: "Bugfix note",
      changeSummary: event.note
    };
  }

  if (event.type === "file_save") {
    return {
      time,
      file,
      workType: "chore",
      mainGoal: "File save",
      changeSummary: `Saved (+${event.addedLines}/-${event.removedLines})`
    };
  }

  return null;
}

function renderReasoningToMarkdown(reasoning: ReasoningJson): string {
  const lines: string[] = [];

  if (reasoning.blocks.length) {
    lines.push(`## 전체 요약 (총 ${reasoning.blocks.length}개 작업)`);
    lines.push("1) 아래 타임라인은 각 파일/작업 단위로 정리되었습니다.");
    lines.push("2) ‘왜 이렇게 했나’와 ‘대안’ 섹션을 먼저 읽으면 맥락 파악이 빠릅니다.");
    lines.push("3) ‘다음 번 메모/체크리스트’는 바로 재사용 가능한 행동 가이드입니다.");
    lines.push("4) 필요하면 각 섹션을 복사해 팀 위키/이슈 코멘트에 붙여넣어 재활용하세요.");
    lines.push("");
  }

  let index = 1;
  for (const block of reasoning.blocks) {
    const file = block.file || "project";
    lines.push(`## ${index}. ${file} (${block.time})`);
    lines.push(`- 핵심 한 줄: ${block.oneLineSummary}`);
    lines.push(`- 배경/문제: ${block.problem}`);

    // 1. 무엇을 했나요?
    lines.push("1) 무엇을 했나요?");
    if (block.behavior.length) {
      for (const item of block.behavior) {
        lines.push(`   - ${item}`);
      }
    } else {
      lines.push("   - (기록된 행동이 없습니다. 간단히 적어두면 다음 회고에 도움됩니다.)");
    }

    // 2. 왜 이렇게 선택했나요? + 대안
    lines.push("2) 왜 이렇게 선택했나요?");
    if (block.whyChosen.length) {
      for (const reason of block.whyChosen) {
        lines.push(`   - ${reason}`);
      }
    } else {
      lines.push("   - (선택 근거가 비어 있습니다. 다음에는 의도/제약을 한 줄로 남겨보세요.)");
    }

    if (block.alternatives.length) {
      lines.push("   - 고려한 대안과 비교:");
      for (const alt of block.alternatives) {
        const pros = alt.pros.length ? `장점: ${alt.pros.join(", ")}` : "장점: (기록 없음)";
        const cons = alt.cons.length ? `단점: ${alt.cons.join(", ")}` : "단점: (기록 없음)";
        const joined = [pros, cons].filter(Boolean).join(" | ");
        lines.push(`     • ${alt.name}${joined ? ` (${joined})` : ""}`);
      }
    }

    // 3. 개념/주의 포인트
    lines.push("3) 관련 개념/주의 포인트:");
    if (block.concepts.length) {
      for (const concept of block.concepts) {
        const pitfalls = concept.pitfalls.length ? `함정: ${concept.pitfalls.join("; ")}` : "함정: (없음)";
        lines.push(
          `   - ${concept.name}: ${concept.whatItIs} | 왜 중요?: ${concept.whyRelevantHere} | ${pitfalls}`
        );
      }
    } else {
      lines.push("   - (기록된 개념이 없습니다. 핵심 개념을 1~2개만 적어도 이후 복습에 큰 도움.)");
    }

    // 4. 트레이드오프/리스크
    lines.push("4) 트레이드오프/리스크:");
    if (block.tradeoffs.length) {
      for (const tradeoff of block.tradeoffs) {
        lines.push(`   - ${tradeoff}`);
      }
    } else {
      lines.push("   - (위험/절충점이 비어 있습니다. 성능/안정성/시간 중 무엇을 희생했는지 짧게 남겨두세요.)");
    }

    // 5. 다음 번 메모/체크리스트
    lines.push("5) 다음 번 메모/체크리스트:");
    if (block.rememberThis.length) {
      for (const tip of block.rememberThis) {
        lines.push(`   - ${tip}`);
      }
    } else {
      lines.push("   - (다음에 바로 재사용할 팁을 1~2줄 적어두면 회귀 시 빠르게 꺼낼 수 있습니다.)");
    }

    // 6. 짧은 회고 메모
    lines.push("6) 짧은 회고 메모:");
    lines.push("   - 위의 의도와 대안, 개념을 다시 보면 비슷한 상황에서 의사결정을 복원하기 쉽습니다.");
    lines.push("   - 필요하면 이 블록 전체를 팀 문서/이슈에 붙여넣어 공유하세요.");

    lines.push("");
    index += 1;
  }

  return lines.join("\n").trim();
}

/**
 * Converts Markdown into a styled HTML document for display/export.
 */
export function buildReportHtml(markdown: string): string {
  const htmlBody = renderMarkdownToHtml(markdown);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DebtCrasher Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      background: #ffffff;
      color: #333;
    }
    .markdown-body { 
      line-height: 1.7; 
      font-size: 16px; 
      color: #37352f;
    }
    .markdown-body h1 { 
      font-size: 2.2em;
      font-weight: 700;
      margin-bottom: 0.5em;
      border-bottom: none;
    }
    .markdown-body h2 { 
      font-size: 1.5em;
      font-weight: 600;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      border-bottom: 1px solid #efefef;
      padding-bottom: 8px;
    }
    .markdown-body code { 
      background: #f7f6f3; 
      color: #eb5757;
      padding: 0.2em 0.4em; 
      border-radius: 3px; 
      font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 85%;
    }
    .markdown-body blockquote {
      border-left: 3px solid currentcolor;
      padding-left: 1em;
      color: inherit;
      opacity: 0.8;
      margin-left: 0;
      margin-right: 0;
    }
  </style>
</head>
<body>
  <div class="markdown-body">
    ${htmlBody}
  </div>
</body>
  </html>`;
}

/**
 * Generates a PDF file from the report Markdown using a headless browser when available.
 */
export async function exportReportPdf(
  workspaceRoot: string,
  markdown: string
): Promise<string> {
  // Puppeteer removal: Using browser print in Webview is preferred for this extension.
  // This function now just saves the HTML for manual use if needed.
  const { reportsDir } = ensureDirectories(workspaceRoot);
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const htmlPath = path.join(reportsDir, `report-${timestamp}.html`);
  const html = buildReportHtml(markdown);
  
  fs.writeFileSync(htmlPath, html, "utf8");
  return htmlPath;
}

/**
 * Lightweight Markdown renderer for PDF export (headings, lists, quotes, code).
 */
function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushList();
      continue;
    }

    if (line.startsWith("### ")) {
      flushList();
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("> ")) {
      flushList();
      html.push(`<blockquote>${escapeHtml(line.slice(2))}</blockquote>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${applyInlineCode(line.slice(2))}</li>`);
      continue;
    }

    flushList();
    html.push(`<p>${applyInlineCode(line)}</p>`);
  }

  flushList();
  return html.join("\n");
}

function applyInlineCode(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
