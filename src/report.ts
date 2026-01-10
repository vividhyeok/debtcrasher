import * as fs from "fs";
import * as path from "path";
import { ensureDirectories, readLogEvents, LogEvent, BaseEvent } from "./logging";
import { AiProvider, generateReportBlocks, renderBlocksToMarkdown, ReportBlock } from "./aiClient";

export type GeneratedReport = {
  markdown: string;
  reportPath: string;
};

export type ReportGenerationOptions = {
  provider: AiProvider;
  apiKey: string;
  model: string;
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
    const chunks = chunkEventsByDate(relevantEvents);
    const blocks: ReportBlock[] = [];

    for (const chunk of chunks) {
      const chunkBlocks = await generateReportBlocks(
        options.provider,
        options.apiKey,
        options.model,
        chunk.events,
        chunk.label
      );
      blocks.push(...chunkBlocks);
    }

    if (blocks.length === 0) {
      timelineMarkdown = "요약 블록을 생성하지 못했습니다. 로그 내용을 확인해 주세요.";
    } else {
      timelineMarkdown = await renderTimelineMarkdown(options, blocks);
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

type EventChunk = {
  label: string;
  events: BaseEvent[];
};

/**
 * Groups events by date to keep LLM chunks stable.
 */
function chunkEventsByDate(events: BaseEvent[]): EventChunk[] {
  const chunks = new Map<string, BaseEvent[]>();
  for (const event of events) {
    const key = event.timestamp.slice(0, 10);
    if (!chunks.has(key)) {
      chunks.set(key, []);
    }
    chunks.get(key)?.push(event);
  }

  return Array.from(chunks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, chunkEvents]) => ({
      label,
      events: chunkEvents
    }));
}

/**
 * Renders timeline blocks into Markdown in stable chunk sizes.
 */
async function renderTimelineMarkdown(
  options: ReportGenerationOptions,
  blocks: ReportBlock[]
): Promise<string> {
  const chunkSize = 30;
  const markdownParts: string[] = [];

  for (let i = 0; i < blocks.length; i += chunkSize) {
    const slice = blocks.slice(i, i + chunkSize);
    const markdown = await renderBlocksToMarkdown(
      options.provider,
      options.apiKey,
      options.model,
      slice,
      false
    );
    markdownParts.push(markdown.trim());
  }

  return markdownParts.join("\n\n");
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
