import * as vscode from "vscode";
import {
  appendLogEvent,
  captureFileSaveEvent,
  createTextEvent,
  createAiNoteEvent,
  ensureDirectories,
  getCachedDocumentContent,
  readLogEvents,
  primeDocumentContent
} from "./logging";
import { generateReport } from "./report";
import { openReportWebview } from "./webview";
import { generateAiNote, AiProvider, AiNoteRequest, WorkType } from "./aiClient";

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = getWorkspaceRoot();

  if (!workspaceRoot) {
    vscode.window.showWarningMessage("DebtCrasher: Workspace folder not found.");
    return;
  }

  ensureDirectories(workspaceRoot);

  const decisionCommand = vscode.commands.registerCommand(
    "debtcrasher.recordDecision",
    async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Record a short decision memo",
        placeHolder: "e.g. Chose SQLite for faster iteration"
      });

      if (!input) {
        return;
      }

      // Pass active editor to capture file context if available
      const activeEditor = vscode.window.activeTextEditor;
      
      const event = createTextEvent("decision", input, workspaceRoot, activeEditor);
      appendLogEvent(workspaceRoot, event);
      vscode.window.showInformationMessage("DebtCrasher: Decision recorded.");
    }
  );

  const bugfixCommand = vscode.commands.registerCommand(
    "debtcrasher.recordBugfix",
    async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Record a short bugfix memo",
        placeHolder: "e.g. Fixed null pointer in auth flow"
      });

      if (!input) {
        return;
      }

      // Pass active editor to capture file context if available
      const activeEditor = vscode.window.activeTextEditor;

      const event = createTextEvent("bugfix", input, workspaceRoot, activeEditor);
      appendLogEvent(workspaceRoot, event);
      vscode.window.showInformationMessage("DebtCrasher: Bugfix recorded.");
    }
  );

  const reportCommand = vscode.commands.registerCommand(
    "debtcrasher.openReport",
    () => {
      const report = generateReport(workspaceRoot);
      openReportWebview(context, report.markdown);
    }
  );

  const aiNoteCommand = vscode.commands.registerCommand(
    "debtcrasher.generateAiNote",
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage("DebtCrasher: No active editor found.");
        return;
      }

      const workType = await vscode.window.showQuickPick<WorkType>(
        ["feature", "refactor", "bugfix", "test", "chore"],
        { placeHolder: "Select the work type for this AI note" }
      );
      if (!workType) {
        return;
      }

      const userHint = await vscode.window.showInputBox({
        prompt: "Optional: add a one-line hint for the AI note",
        placeHolder: "e.g. Refactored validation flow for readability"
      });

      const config = vscode.workspace.getConfiguration("debtcrasher");
      const provider = config.get<AiProvider>("ai.provider", "none");
      const apiKey = config.get<string>("ai.apiKey", "");

      if (provider === "none" || !apiKey) {
        vscode.window.showErrorMessage(
          "DebtCrasher: Configure an AI provider and API key in settings first."
        );
        return;
      }

      const filePath = vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath);
      const languageId = activeEditor.document.languageId;
      const recentEvents = readLogEvents(workspaceRoot)
        .filter((event) => event.type === "file_save" && event.filePath === filePath)
        .sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        .slice(-5)
        .map(
          (event) =>
            `${event.timestamp} (+${event.addedLines}/-${event.removedLines}) ${event.filePath}`
        );

      const diffSnippet = buildDiffSnippet(
        activeEditor.document,
        getCachedDocumentContent(activeEditor.document.uri.fsPath)
      );

      const request: AiNoteRequest = {
        workType,
        filePath,
        languageId,
        userHint,
        recentFileSaves: recentEvents,
        diffSnippet
      };

      try {
        const payload = await generateAiNote(provider, apiKey, request);
        const event = createAiNoteEvent(payload, workspaceRoot, filePath);
        appendLogEvent(workspaceRoot, event);
        vscode.window.showInformationMessage("DebtCrasher: AI note generated.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error.";
        vscode.window.showErrorMessage(`DebtCrasher: Failed to generate AI note. ${message}`);
      }
    }
  );

  // Strategy: "Diff calculation based on previous save"
  const saveSubscription = vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
    if (document.uri.scheme !== "file") {
      return;
    }
    const event = captureFileSaveEvent(document, workspaceRoot);
    appendLogEvent(workspaceRoot, event);
  });

  // Strategy: "Diff calculation based on previous save" - cache initial content
  const openSubscription = vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
    if (document.uri.scheme !== "file") {
      return;
    }
    primeDocumentContent(document);
  });

  context.subscriptions.push(
    decisionCommand,
    bugfixCommand,
    reportCommand,
    aiNoteCommand,
    saveSubscription,
    openSubscription
  );
}

export function deactivate(): void {
  // No cleanup required for MVP.
}

function getWorkspaceRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

function buildDiffSnippet(document: vscode.TextDocument, cachedContent?: string): string {
  const currentContent = document.getText();
  if (cachedContent && cachedContent !== currentContent) {
    const diffLines = currentContent.split(/\r?\n/);
    const cachedLines = cachedContent.split(/\r?\n/);
    const beforeSnippet = cachedLines.slice(0, 120).join("\n");
    const afterSnippet = diffLines.slice(0, 120).join("\n");
    return [
      "before (truncated):",
      beforeSnippet,
      "",
      "after (truncated):",
      afterSnippet
    ].join("\n");
  }

  const lines = currentContent.split(/\r?\n/);
  if (lines.length <= 200) {
    return lines.join("\n");
  }

  const head = lines.slice(0, 120).join("\n");
  const tail = lines.slice(-80).join("\n");
  return [head, "", "...", "", tail].join("\n");
}
