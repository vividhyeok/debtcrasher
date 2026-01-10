import * as fs from "fs";
import * as path from "path";
import {
  ensureDirectories,
  readLogEvents,
  LogEvent,
  FileSaveEvent,
  DecisionEvent,
  BugfixEvent,
  AiNoteEvent
} from "./logging";

export type GeneratedReport = {
  markdown: string;
  reportPath: string;
};

// -------------------------------------------------------------------------
// Layer B - Narrative Report Layer
// Reconstructs the development story from the structured logs (Layer A).
// -------------------------------------------------------------------------

export function generateReport(workspaceRoot: string): GeneratedReport {
  const { reportsDir } = ensureDirectories(workspaceRoot);
  const events: LogEvent[] = readLogEvents(workspaceRoot);

  // Sort events by timestamp just in case
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const fileSaveEvents = events.filter((e): e is FileSaveEvent => e.type === "file_save");
  const decisionEvents = events.filter((e): e is DecisionEvent => e.type === "decision");
  const bugfixEvents = events.filter((e): e is BugfixEvent => e.type === "bugfix");
  const aiNoteEvents = events.filter((e): e is AiNoteEvent => e.type === "ai_note");

  // Format Timeline
  const timelineSection = fileSaveEvents.map((e) => {
    const branchInfo = e.branch ? `, branch: ${e.branch}` : "";
    const dateStr = formatTimestamp(e.timestamp);
    return `- ${dateStr} — \`${e.filePath}\` ( +${e.addedLines} / -${e.removedLines}${branchInfo} )`;
  });

  // Format Decisions
  const decisionsSection = decisionEvents.map((e) => {
    const dateStr = formatTimestamp(e.timestamp);
    const contextStr = e.filePath ? `파일: \`${e.filePath}\`` : "";
    return `- **${dateStr}** ${contextStr}\n  > 💡 ${e.note}`;
  });

  // Format Bugfixes
  const bugfixesSection = bugfixEvents.map((e) => {
    const dateStr = formatTimestamp(e.timestamp);
    const contextStr = e.filePath ? `파일: \`${e.filePath}\`` : "";
    return `- **${dateStr}** ${contextStr}\n  > 🐛 ${e.note}`;
  });

  const aiNotesSection = aiNoteEvents.map((e) => {
    const dateStr = formatTimestamp(e.timestamp);
    const filePath = e.filePath ?? "unknown";
    const emojiMap: Record<string, string> = {
        feature: "✨", refactor: "♻️", bugfix: "🔧", test: "🧪", chore: "🧹"
    };
    const emoji = emojiMap[e.workType] || "🤖";
    
    const lines: string[] = [];
    lines.push(`### ${emoji} [${e.workType}] ${e.mainGoal}`);
    lines.push(`**파일**: \`${filePath}\` | **일시**: ${dateStr}`);
    lines.push(``);
    lines.push(`> ${e.changeSummary}`);
    lines.push(``);
    if (e.importantFunctions && e.importantFunctions.length > 0) {
        lines.push(`- **주요 함수**: \`${e.importantFunctions.join("`, `")}\``);
    }
    if (e.risks) {
      lines.push(`- **⚠️ 리스크**: ${e.risks}`);
    }
    if (e.nextSteps) {
      lines.push(`- **⏭️ 다음 단계**: ${e.nextSteps}`);
    }
    lines.push(`---`);
    return lines.join("\n");
  });

  const now = new Date().toISOString();
  
  const markdown = [
    "# 📑 DebtCrasher 리포트",
    "",
    `**생성일**: ${formatTimestamp(now)}`,
    "",
    "---",
    "",
    "## 🤖 AI 개발 노트 (AI Notes)",
    "",
    aiNotesSection.length ? aiNotesSection.join("\n") : "_기록된 AI 노트가 없습니다._",
    "",
    "## 💡 의사결정 (Decisions)",
    "",
    decisionsSection.length ? decisionsSection.join("\n") : "_기록된 의사결정이 없습니다._",
    "",
    "## 🐛 버그 수정 (Bugfixes)",
    "",
    bugfixesSection.length ? bugfixesSection.join("\n") : "_기록된 버그 수정 내역이 없습니다._",
    "",
    "## 📅 전체 타임라인",
    "",
    timelineSection.length ? timelineSection.join("\n") : "_저장된 파일 이력이 없습니다._"
  ].join("\n");

  const reportPath = path.join(reportsDir, "report.md");
  fs.writeFileSync(reportPath, markdown, "utf8");

  return { markdown, reportPath };
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  // Format: YYYY-MM-DD HH:MM
  return date.toISOString().replace("T", " ").substring(0, 16);
}
