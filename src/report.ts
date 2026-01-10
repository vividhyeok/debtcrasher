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
    const contextStr = e.filePath ? `[${e.filePath}] ` : "";
    return `- ${dateStr} — ${contextStr}${e.note}`;
  });

  // Format Bugfixes
  const bugfixesSection = bugfixEvents.map((e) => {
    const dateStr = formatTimestamp(e.timestamp);
    const contextStr = e.filePath ? `[${e.filePath}] ` : "";
    return `- ${dateStr} — ${contextStr}${e.note}`;
  });

  const aiNotesSection = aiNoteEvents.map((e) => {
    const dateStr = formatTimestamp(e.timestamp);
    const filePath = e.filePath ?? "unknown";
    const lines: string[] = [];
    lines.push(`- [${e.workType}] (${dateStr}) ${filePath} — ${e.mainGoal}`);
    lines.push(`  - changeSummary: ${e.changeSummary}`);
    lines.push(`  - importantFunctions: ${e.importantFunctions.join(", ")}`);
    if (e.risks) {
      lines.push(`  - risks: ${e.risks}`);
    }
    if (e.nextSteps) {
      lines.push(`  - nextSteps: ${e.nextSteps}`);
    }
    return lines.join("\n");
  });

  const now = new Date().toISOString();
  
  const markdown = [
    "# DebtCrasher Report",
    "",
    `생성일: ${now}`,
    "",
    "## 1. Timeline (File Saves)",
    "",
    timelineSection.length ? timelineSection.join("\n") : "- No file save events recorded.",
    "",
    "## 2. Decisions",
    "",
    decisionsSection.length ? decisionsSection.join("\n") : "- No decisions recorded.",
    "",
    "## 3. Bugfixes",
    "",
    bugfixesSection.length ? bugfixesSection.join("\n") : "- No bugfix notes recorded.",
    "",
    "## 4. AI Notes",
    "",
    aiNotesSection.length ? aiNotesSection.join("\n") : "- No AI notes recorded."
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
