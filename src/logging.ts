import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { diffLines } from "diff";
import { execSync } from "child_process";

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;

export type LogEvent = {
  type: "file_save" | "decision" | "bugfix";
  timestamp: string;
  data: Record<string, unknown>;
};

const lastSavedContent = new Map<string, string>();

export function primeDocumentContent(document: vscode.TextDocument): void {
  if (!document.uri.fsPath) {
    return;
  }

  if (!lastSavedContent.has(document.uri.fsPath)) {
    lastSavedContent.set(document.uri.fsPath, document.getText());
  }
}

export function captureFileSaveEvent(
  document: vscode.TextDocument,
  workspaceRoot: string
): LogEvent {
  const previousContent = lastSavedContent.get(document.uri.fsPath) ?? "";
  const currentContent = document.getText();
  const diff = diffLines(previousContent, currentContent);

  let added = 0;
  let removed = 0;

  for (const part of diff) {
    if (part.added) {
      added += countLines(part.value);
    } else if (part.removed) {
      removed += countLines(part.value);
    }
  }

  const relativePath = path.relative(workspaceRoot, document.uri.fsPath);

  lastSavedContent.set(document.uri.fsPath, currentContent);

  return {
    type: "file_save",
    timestamp: new Date().toISOString(),
    data: {
      filePath: relativePath,
      addedLines: added,
      removedLines: removed,
      branch: resolveGitBranch(workspaceRoot),
      languageId: document.languageId
    }
  };
}

export function createTextEvent(
  type: "decision" | "bugfix",
  message: string
): LogEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    data: {
      message
    }
  };
}

export function appendLogEvent(workspaceRoot: string, event: LogEvent): void {
  const { logsDir } = ensureDirectories(workspaceRoot);
  const logFilePath = resolveLogFilePath(logsDir);
  const entry = `${JSON.stringify(event)}\n`;
  fs.appendFileSync(logFilePath, entry, "utf8");
}

export function ensureDirectories(workspaceRoot: string): {
  baseDir: string;
  logsDir: string;
  reportsDir: string;
} {
  const baseDir = path.join(workspaceRoot, ".devcrasher");
  const logsDir = path.join(baseDir, "logs");
  const reportsDir = path.join(baseDir, "reports");

  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });

  return { baseDir, logsDir, reportsDir };
}

function resolveLogFilePath(logsDir: string): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const baseName = `${dateStamp}.log`;
  const basePath = path.join(logsDir, baseName);

  if (!fs.existsSync(basePath)) {
    return basePath;
  }

  const stats = fs.statSync(basePath);
  if (stats.size < MAX_LOG_SIZE_BYTES) {
    return basePath;
  }

  const existing = fs
    .readdirSync(logsDir)
    .filter((file) => file.startsWith(`${dateStamp}-`) && file.endsWith(".log"));

  const nextIndex = existing.length + 2;
  return path.join(logsDir, `${dateStamp}-${nextIndex}.log`);
}

function countLines(value: string): number {
  if (!value) {
    return 0;
  }
  const parts = value.split(/\r?\n/);
  return parts[parts.length - 1] === "" ? parts.length - 1 : parts.length;
}

function resolveGitBranch(workspaceRoot: string): string | null {
  try {
    const output = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "ignore"]
    })
      .toString()
      .trim();
    return output || null;
  } catch {
    return null;
  }
}
