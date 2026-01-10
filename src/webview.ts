import * as vscode from "vscode";

// -------------------------------------------------------------------------
// Layer B - Narrative Report Layer (Presentation)
// Renders the reconstructed story in a user-friendly Webview.
// -------------------------------------------------------------------------

export function openReportWebview(
  context: vscode.ExtensionContext,
  markdown: string
): void {
  const panel = vscode.window.createWebviewPanel(
    "debtcrasherReport",
    "DebtCrasher Report",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = getWebviewHtml(context, markdown);
  
  // Future: Handle PDF export message from webview
  panel.webview.onDidReceiveMessage(message => {
      if (message.command === 'exportPdf') {
          vscode.window.showInformationMessage("PDF Export is not fully implemented in this MVP. (Use browser print as fallback)");
      }
  });
}

function getWebviewHtml(
  context: vscode.ExtensionContext,
  markdown: string
): string {
  const nonce = createNonce();
  // Safe serialization of content
  const content = JSON.stringify(markdown);

  // Simple extraction of date
  const dateMatch = markdown.match(/생성일: (.*)/);
  const reportDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!-- Allow scripts from unpkg for marked.js, and inline styles/scripts -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; script-src 'nonce-${nonce}' https: 'unsafe-eval';" />
  <title>DebtCrasher Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #eef2f5; 
      color: #333;
    }
    .toolbar-container {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #fff;
      border-bottom: 1px solid #ddd;
      padding: 10px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .toolbar-content {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .toolbar-title {
      font-weight: 600;
      font-size: 16px;
      color: #2c3e50;
    }
    .toolbar-date {
        font-size: 12px;
        color: #7f8c8d;
        margin-left: 10px;
    }
    .btn-export {
      background-color: #0969da;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    .btn-export:hover {
      background-color: #0255b8;
    }
    .page-container {
      display: flex;
      justify-content: center;
      padding: 30px 20px;
    }
    .page {
      width: 100%;
      max-width: 800px; 
      background: #ffffff;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      border-radius: 4px;
      padding: 48px 56px;
      box-sizing: border-box;
      min-height: 800px;
    }
    /* Notion-like Styles */
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
    .markdown-body h3 {
        font-size: 1.25em;
        font-weight: 600;
        margin-top: 1.2em;
        margin-bottom: 0.2em;
    }
    .markdown-body pre { 
        background: #f7f6f3; 
        padding: 16px; 
        overflow: auto; 
        border-radius: 3px; 
        font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 14px;
        color: #eb5757;
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
    .markdown-body hr {
        height: 1px;
        background-color: #efefef;
        border: none;
        margin: 2em 0;
    }
    .toolbar-container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
    }
    .error-message { color: red; padding: 20px; text-align: center; }
  </style>
</head>
<body>
  <div class="toolbar-container">
    <div class="toolbar-content">
      <div>
        <span class="toolbar-title">DebtCrasher Report</span>
        <span class="toolbar-date">${reportDate}</span>
      </div>
      <button type="button" class="btn-export" id="btn-export">Export PDF</button>
    </div>
  </div>
  
  <div class="page-container">
    <div class="page">
      <div id="content" class="markdown-body">Loading...</div>
    </div>
  </div>

  <!-- Use marked.js from CDN -->
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  
  <script nonce="${nonce}">
    const markdown = ${content};
    const vscode = acquireVsCodeApi();

    // Export button handler
    document.getElementById('btn-export').addEventListener('click', () => {
        vscode.postMessage({ command: 'exportPdf' });
        // Try native print for immediate PDF save capability
        window.print();
    });

    // Render markdown
    try {
        if (typeof marked !== 'undefined') {
            document.getElementById('content').innerHTML = marked.parse(markdown);
        } else {
            // Fallback if CDN fails (e.g. offline)
            document.getElementById('content').innerHTML = 
                '<div class="markdown-body"><p>⚠ Failed to load Markdown renderer (marked.js). Check your internet connection.</p><pre>' + 
                markdown.replace(/</g, "&lt;") + 
                '</pre></div>';
        }
    } catch (e) {
        document.getElementById('content').innerHTML = '<div class="error-message">Error rendering report: ' + e + '</div>';
    }
  </script>
</body>
</html>`;
}

function createNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
