import * as vscode from "vscode";
import {
  appendLogEvent,
  captureFileSaveEvent,
  createTextEvent,
  ensureDirectories,
  primeDocumentContent
} from "./logging";
import { generateReport } from "./report";
import { openReportWebview } from "./webview";

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

      appendLogEvent(workspaceRoot, createTextEvent("decision", input));
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

      appendLogEvent(workspaceRoot, createTextEvent("bugfix", input));
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

  const saveSubscription = vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.uri.scheme !== "file") {
      return;
    }
    const event = captureFileSaveEvent(document, workspaceRoot);
    appendLogEvent(workspaceRoot, event);
  });

  const openSubscription = vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.uri.scheme !== "file") {
      return;
    }
    primeDocumentContent(document);
  });

  context.subscriptions.push(
    decisionCommand,
    bugfixCommand,
    reportCommand,
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
