import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { diffLines } from "diff";
import { execSync } from "child_process";

// -------------------------------------------------------------------------
// Layer A - Structured Log Layer
// Stores raw development events in JSON Lines format for reliability and structure.
// -------------------------------------------------------------------------

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024;

export type EventType = 'file_save' | 'decision' | 'bugfix' | 'llm_call';

export interface BaseEvent {
  type: EventType;
  timestamp: string;      // ISO string
  branch?: string;
  filePath?: string;
}

export interface FileSaveEvent extends BaseEvent {
  type: 'file_save';
  addedLines: number;
  removedLines: number;
  languageId: string;
}

export interface DecisionEvent extends BaseEvent {
  type: 'decision';
  note: string;
  context?: {
    line?: number;
  };
}

export interface BugfixEvent extends BaseEvent {
  type: 'bugfix';
  note: string;
  context?: {
    line?: number;
  };
}

export interface LlmCallEvent extends BaseEvent {
  type: 'llm_call';
  tool: string;           // e.g., 'claude', 'gemini'
  argsSummary: string;
}

export type LogEvent = FileSaveEvent | DecisionEvent | BugfixEvent | LlmCallEvent;

const lastSavedContent = new Map<string, string>();

/**
 * Caches the current document content to be used as a base for the next diff calculation.
 * Strategy: "Diff calculation based on previous save"
 */
export function primeDocumentContent(document: vscode.TextDocument): void {
  if (!document.uri.fsPath) {
    return;
  }

  if (!lastSavedContent.has(document.uri.fsPath)) {
    lastSavedContent.set(document.uri.fsPath, document.getText());
  }
}

/**
 * Captures a file save event by comparing current content with the last cached content.
 * Strategy: "Diff calculation based on previous save"
 */
export function captureFileSaveEvent(
  document: vscode.TextDocument,
  workspaceRoot: string
): FileSaveEvent {
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
  
  // Update cache for next comparison
  lastSavedContent.set(document.uri.fsPath, currentContent);

  return {
    type: "file_save",
    timestamp: new Date().toISOString(),
    branch: resolveGitBranch(workspaceRoot) ?? "unknown",
    filePath: relativePath,
    addedLines: added,
    removedLines: removed,
    languageId: document.languageId
  };
}

export function createTextEvent(
  type: "decision" | "bugfix",
  note: string,
  workspaceRoot?: string,
  editor?: vscode.TextEditor
): DecisionEvent | BugfixEvent {
  const timestamp = new Date().toISOString();
  let filePath: string | undefined;
  let context: { line?: number } | undefined;
  let branch: string | undefined;

  if (workspaceRoot && editor) {
    filePath = path.relative(workspaceRoot, editor.document.uri.fsPath);
    // 1-based line number
    context = { line: editor.selection.active.line + 1 };
    branch = resolveGitBranch(workspaceRoot) ?? "unknown";
  } else if (workspaceRoot) {
    branch = resolveGitBranch(workspaceRoot) ?? "unknown";
  }

  if (type === "decision") {
    return {
      type: "decision",
      timestamp,
      branch,
      filePath,
      note,
      context
    };
  } else {
    return {
      type: "bugfix",
      timestamp,
      branch,
      filePath,
      note,
      context
    };
  }
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

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

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
