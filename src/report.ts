import * as fs from "fs";
import * as path from "path";
import { ensureDirectories, readLogEvents, LogEvent } from "./logging";
import { AiProvider, BaseBlock, ReasoningJson, WorkType, generateReportReasoning } from "./aiClient";

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
    const baseBlocks = buildBaseBlocks(relevantEvents, workspaceRoot);

    if (!baseBlocks.length) {
      timelineMarkdown = "요약 블록을 생성하지 못했습니다. 로그 내용을 확인해 주세요.";
    } else {
      const reasoning = await generateReportReasoning(
        options.provider,
        options.apiKey,
        options.reasoningModel,
        baseBlocks
      );
      timelineMarkdown = renderMarkdown(reasoning);
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

type BaseBlockBuilder = {
  timeStart: Date;
  timeEnd: Date;
  file: string;
  workType?: WorkType;
  mainGoal?: string;
  changeSummaryParts: string[];
  importantFunctions: Set<string>;
  risks?: string;
  nextSteps?: string;
};

const MERGE_WINDOW_MINUTES = 30;

function buildBaseBlocks(events: LogEvent[], workspaceRoot: string): BaseBlock[] {
  const builders: BaseBlockBuilder[] = [];

  for (const event of events) {
    const eventTime = new Date(event.timestamp);
    const file = event.filePath ?? "project";

    const lastBuilder = builders[builders.length - 1];
    const withinWindow =
      lastBuilder &&
      lastBuilder.file === file &&
      (eventTime.getTime() - lastBuilder.timeEnd.getTime()) / 60000 <= MERGE_WINDOW_MINUTES;

    const builder = withinWindow
      ? lastBuilder
      : {
          timeStart: eventTime,
          timeEnd: eventTime,
          file,
          changeSummaryParts: [],
          importantFunctions: new Set<string>()
        };

    if (!withinWindow) {
      builders.push(builder);
    }

    builder.timeEnd = eventTime;

    switch (event.type) {
      case "ai_note":
        builder.workType = event.workType;
        builder.mainGoal = event.mainGoal || builder.mainGoal;
        if (event.changeSummary) {
          builder.changeSummaryParts.push(event.changeSummary);
        }
        event.importantFunctions?.forEach((fn) => builder.importantFunctions.add(fn));
        builder.risks = event.risks || builder.risks;
        builder.nextSteps = event.nextSteps || builder.nextSteps;
        break;
      case "decision":
        builder.workType = builder.workType ?? "chore";
        builder.mainGoal = builder.mainGoal ?? "의사결정 기록";
        builder.changeSummaryParts.push(`의사결정: ${event.note}`);
        break;
      case "bugfix":
        builder.workType = builder.workType ?? "bugfix";
        builder.mainGoal = builder.mainGoal ?? "버그 수정 기록";
        builder.changeSummaryParts.push(`버그 메모: ${event.note}`);
        break;
      case "file_save":
        builder.workType = builder.workType ?? "chore";
        builder.mainGoal = builder.mainGoal ?? "파일 변경";
        builder.changeSummaryParts.push(`파일 저장 (+${event.addedLines}/-${event.removedLines})`);
        break;
      default:
        break;
    }
  }

  return builders
    .map((builder) => {
      const changeSummary = builder.changeSummaryParts.filter(Boolean).join(" / ");
      const codeSnippet = extractCodeSnippet(workspaceRoot, builder.file);
      return {
        time: formatTimestamp(builder.timeEnd.toISOString()),
        file: builder.file,
        workType: builder.workType,
        mainGoal: builder.mainGoal,
        changeSummary: changeSummary || builder.mainGoal || "변경 요약",
        importantFunctions: builder.importantFunctions.size ? Array.from(builder.importantFunctions) : undefined,
        risks: builder.risks,
        nextSteps: builder.nextSteps,
        codeSnippet
      };
    })
    .filter((block) => block.changeSummary);
}

function extractCodeSnippet(workspaceRoot: string, relativeFile?: string): string | undefined {
  if (!relativeFile || relativeFile === "project") {
    return undefined;
  }

  const absolutePath = path.join(workspaceRoot, relativeFile);
  if (!fs.existsSync(absolutePath)) {
    return undefined;
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  const lines = content.split(/\r?\n/);
  if (!lines.length) {
    return undefined;
  }

  const pattern = /^\s*(export\s+)?(async\s+)?(function|class)\s+\w+|^\s*(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s*)?\(/;
  const matchIndex = lines.findIndex((line) => pattern.test(line));
  const start = Math.max(0, (matchIndex === -1 ? 0 : matchIndex - 2));
  const end = Math.min(lines.length, start + 40);
  const snippet = lines.slice(start, end).join("\n").trim();
  if (!snippet) {
    return undefined;
  }

  const maxChars = 1200;
  return snippet.length > maxChars ? `${snippet.slice(0, maxChars)}\n...` : snippet;
}

export function renderMarkdown(reasoning: ReasoningJson): string {
  const lines: string[] = [];

  if (reasoning.blocks.length) {
    lines.push(`## 전체 요약 (총 ${reasoning.blocks.length}개 작업)`);
    lines.push("- 아래 타임라인은 파일/작업 단위로 묶은 학습지입니다.");
    lines.push("- ‘왜 이렇게 했나’와 ‘대안’ 섹션을 먼저 읽으면 맥락 파악이 빠릅니다.");
    lines.push("- 체크리스트 항목은 다음 작업에서 바로 재사용할 수 있습니다.");
    lines.push("");
  }

  let index = 1;
  for (const block of reasoning.blocks) {
    const file = block.file || "project";
    lines.push(`## ${index}. ${file} (${block.time})`);
    lines.push(`- 한 줄 요약: ${block.oneLineSummary}`);
    lines.push(`- 배경/문제: ${block.problem}`);

    if (block.behavior.length) {
      lines.push("### 1) 무엇을 했나요?");
      for (const item of block.behavior) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }

    if (block.whyChosen.length || block.alternatives.length) {
      lines.push("### 2) 왜 이렇게 선택했나요?");
      if (block.whyChosen.length) {
        for (const reason of block.whyChosen) {
          lines.push(`- ${reason}`);
        }
      }
      if (block.alternatives.length) {
        lines.push("");
        lines.push("**고려한 대안 비교**");
        for (const alt of block.alternatives) {
          lines.push(`- ${alt.name}`);
          if (alt.pros?.length) {
            lines.push(`  - 장점: ${alt.pros.join(", ")}`);
          }
          if (alt.cons?.length) {
            lines.push(`  - 단점: ${alt.cons.join(", ")}`);
          }
        }
      }
      lines.push("");
    }

    if (block.concepts.length) {
      lines.push("### 3) 핵심 개념과 주의점");
      for (const concept of block.concepts) {
        lines.push(`- ${concept.name}`);
        lines.push(`  - 개념 설명: ${concept.whatItIs}`);
        lines.push(`  - 여기서 중요한 이유: ${concept.whyRelevantHere}`);
        if (concept.pitfalls?.length) {
          lines.push(`  - 흔한 실수: ${concept.pitfalls.join(", ")}`);
        }
      }
      lines.push("");
    }

    if (block.tradeoffs.length) {
      lines.push("### 4) 트레이드오프/리스크");
      for (const tradeoff of block.tradeoffs) {
        lines.push(`- ${tradeoff}`);
      }
      lines.push("");
    }

    if (block.rememberThis.length) {
      lines.push("### 5) 다음 번 체크리스트");
      for (const tip of block.rememberThis) {
        lines.push(`- ${tip}`);
      }
      lines.push("");
    }

    lines.push("### 6) 짧은 회고 메모");
    lines.push("- 의도와 대안을 복기하면 비슷한 상황에서 결정을 복원하기 쉽습니다.");
    lines.push("- 필요하면 이 블록 전체를 팀 문서/이슈에 붙여넣어 공유하세요.");

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
    @page {
      size: A4;
      margin: 16mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      background: #f6f6f6;
      color: #2f3437;
    }
    .page {
      max-width: 210mm;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.08);
      padding: 28px 32px;
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
    @media (prefers-color-scheme: dark) {
      body {
        background: #1e1e1e;
        color: #f3f3f3;
      }
      .page {
        background: #262626;
        box-shadow: 0 6px 24px rgba(0,0,0,0.4);
      }
      .markdown-body code {
        background: #2f2f2f;
        color: #ff8a8a;
      }
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .page {
        box-shadow: none;
        border-radius: 0;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="markdown-body">
      ${htmlBody}
    </div>
  </div>
</body>
  </html>`;
}

/**
 * Exports a standalone HTML file for the report.
 */
export async function exportReportHtml(
  workspaceRoot: string,
  markdown: string
): Promise<string> {
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
  let inOrderedList = false;

  const flushList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    if (inOrderedList) {
      html.push("</ol>");
      inOrderedList = false;
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
    if (/^\d+\.\s+/.test(line)) {
      if (!inOrderedList) {
        html.push("<ol>");
        inOrderedList = true;
      }
      html.push(`<li>${applyInlineCode(line.replace(/^\d+\.\s+/, ""))}</li>`);
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
