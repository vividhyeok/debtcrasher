import * as vscode from "vscode";
import {
  appendLogEvent,
  captureFileSaveEvent,
  createTextEvent,
  createAiNoteEvent,
  ensureDirectories,
  getCachedDocumentContent,
  readLogEvents,
  primeDocumentContent,
  FileSaveEvent
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

      const workTypeRaw = await vscode.window.showQuickPick(
        ["feature", "refactor", "bugfix", "test", "chore"],
        { placeHolder: "Select the work type for this AI note" }
      );
      if (!workTypeRaw) {
        return;
      }
      const workType = workTypeRaw as WorkType;

      const userHint = await vscode.window.showInputBox({
        prompt: "Optional: add a one-line hint for the AI note",
        placeHolder: "e.g. Refactored validation flow for readability"
      });

      const config = vscode.workspace.getConfiguration("debtcrasher");
      
      // Use Note-specific configuration
      const provider = config.get<AiProvider>("note.provider", "openai"); // default to openai if not set
      const model = config.get<string>("note.model", "gpt-4o-mini");
      
      // Retrieve key from global provider registry
      // e.g. debtcrasher.providers.openai.apiKey
      const apiKey = config.get<string>(`providers.${provider}.apiKey`, "");

      if (!apiKey) {
        const selection = await vscode.window.showErrorMessage(
          `DebtCrasher: ${provider} API Key가 설정되지 않았습니다.`,
          "설정 열기"
        );
        if (selection === "설정 열기") {
          vscode.commands.executeCommand("workbench.action.openSettings", `debtcrasher.providers.${provider}.apiKey`);
        }
        return;
      }

      const filePath = vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath);
      const languageId = activeEditor.document.languageId;
      const recentEvents = readLogEvents(workspaceRoot)
        .filter((event): event is FileSaveEvent => event.type === "file_save" && event.filePath === filePath)
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
        const payload = await generateAiNote(provider, apiKey, model, request);
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
  const saveSubscription = vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
    if (document.uri.scheme !== "file") {
      return;
    }
    // Ignore updates to the log files themselves to prevent recursive logging
    if (document.uri.fsPath.includes(".devcrasher")) {
      return;
    }
    const event = captureFileSaveEvent(document, workspaceRoot);
    appendLogEvent(workspaceRoot, event);

    // Auto AI Note Generation
    const config = vscode.workspace.getConfiguration("debtcrasher");
    const autoGen = config.get<boolean>("ai.autoGenerateOnSave", false);
    
    // Only trigger if auto-gen is on, and there are actual changes
    if (autoGen && (event.addedLines > 0 || event.removedLines > 0)) {
        // Resolve settings with fallback hierarchy: note specific > global default
        let provider = config.get<AiProvider>("ai.note.provider", "none");
        if (provider === "none") {
            provider = config.get<AiProvider>("ai.provider", "none");
        }
        
        let apiKey = config.get<string>("ai.note.apiKey", "");
        if (!apiKey) {
            apiKey = config.get<string>("ai.apiKey", "");
        }

        let model = config.get<string>("ai.note.model", "");
        if (!model) {
            model = config.get<string>("ai.model", "");
        }

        if (provider !== "none" && apiKey) {
            const filePath = vscode.workspace.asRelativePath(document.uri.fsPath);
            const recentEvents = readLogEvents(workspaceRoot)
                .filter((e): e is FileSaveEvent => e.type === "file_save" && e.filePath === filePath)
                .slice(-5)
                .map(e => `${e.timestamp} (+${e.addedLines}/-${e.removedLines}) ${e.filePath}`);

             const diffSnippet = buildDiffSnippet(
                document,
                getCachedDocumentContent(document.uri.fsPath)
            );
            
            // For auto-save, we use 'chore' as base and let AI infer if possible, and no user hint
            const request: AiNoteRequest = {
                workType: "chore", 
                filePath,
                languageId: document.languageId,
                userHint: "(Auto-generated on save)",
                recentFileSaves: recentEvents,
                diffSnippet
            };

            try {
                // Run in background without blocking
                generateAiNote(provider, apiKey, model, request).then(payload => {
                    const aiEvent = createAiNoteEvent(payload, workspaceRoot, filePath);
                    appendLogEvent(workspaceRoot, aiEvent);
                });
            } catch {
                // Ignore errors in auto-save mode to not annoy user
            }
        }
    }
  });

  // Strategy: "Diff calculation based on previous save" - cache initial content
  const openSubscription = vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
    if (document.uri.scheme !== "file") {
      return;
    }
    if (document.uri.fsPath.includes(".devcrasher")) {
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
