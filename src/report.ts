import * as fs from "fs";
import * as path from "path";
import { ensureDirectories, LogEvent } from "./logging";

export type GeneratedReport = {
  markdown: string;
  reportPath: string;
};

export function generateReport(workspaceRoot: string): GeneratedReport {
  const { logsDir, reportsDir } = ensureDirectories(workspaceRoot);
  const logFiles = fs
    .readdirSync(logsDir)
    .filter((file) => file.endsWith(".log"))
    .sort();

  const events: LogEvent[] = [];

  for (const file of logFiles) {
    const fullPath = path.join(logsDir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      try {
        events.push(JSON.parse(line) as LogEvent);
      } catch {
        // Skip malformed lines for MVP.
      }
    }
  }

  const timeline = events
    .filter((event) => event.type === "file_save")
    .map((event) => {
      const data = event.data as {
        filePath?: string;
        addedLines?: number;
        removedLines?: number;
        branch?: string | null;
      };
      const branch = data.branch ? ` (branch: ${data.branch})` : "";
      return `- ${event.timestamp} • Saved ${data.filePath} (+${data.addedLines}/-${data.removedLines})${branch}`;
    });

  const decisions = events
    .filter((event) => event.type === "decision")
    .map((event) => {
      const data = event.data as { message?: string };
      return `- ${event.timestamp} • ${data.message}`;
    });

  const bugfixes = events
    .filter((event) => event.type === "bugfix")
    .map((event) => {
      const data = event.data as { message?: string };
      return `- ${event.timestamp} • ${data.message}`;
    });

  const markdown = [
    "# DebtCrasher Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Timeline",
    timeline.length ? timeline.join("\n") : "- No file save events captured yet.",
    "",
    "## Decisions",
    decisions.length ? decisions.join("\n") : "- No decisions recorded yet.",
    "",
    "## Bugfix Notes",
    bugfixes.length ? bugfixes.join("\n") : "- No bugfix notes recorded yet."
  ].join("\n");

  const reportPath = path.join(reportsDir, "report.md");
  fs.writeFileSync(reportPath, markdown, "utf8");

  return { markdown, reportPath };
}
