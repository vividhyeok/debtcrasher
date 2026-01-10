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
  const content = JSON.stringify(markdown);

  // Simple extraction of date from markdown for the header if present
  // Matches "생성일: YYYY-..."
  const dateMatch = markdown.match(/생성일: (.*)/);
  const reportDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; script-src 'nonce-${nonce}' https:;" />
  <title>DebtCrasher Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
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
      max-width: 800px; /* A4 width approx, readable line length */
      background: #ffffff;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      border-radius: 4px;
      padding: 48px 56px;
      box-sizing: border-box;
      min-height: 800px;
    }

    /* Markdown Styles */
    .markdown-body {
        line-height: 1.6;
        font-size: 15px;
    }
    .markdown-body h1 { border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; margin-top: 0; }
    .markdown-body h2 { margin-top: 24px; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    .markdown-body blockquote { border-left: 4px solid #dfe2e5; padding-left: 1rem; color: #6a737d; }
    .markdown-body code { background: rgba(27,31,35,0.05); padding: 0.2em 0.4em; border-radius: 3px; font-size: 85%; font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace; }
    .markdown-body pre { background: #f6f8fa; padding: 16px; overflow: auto; border-radius: 6px; }
    .markdown-body pre code { background: transparent; padding: 0; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script nonce="${nonce}" src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script nonce="${nonce}" src="https://unpkg.com/marked/marked.min.js"></script>
  <script nonce="${nonce}">
    const markdown = ${content};
    const reportDate = "${reportDate}";
    const vscode = acquireVsCodeApi();

    const root = document.getElementById('root');
    const { useState, useEffect } = React;

    const App = () => {
      
      const handleExport = () => {
          vscode.postMessage({ command: 'exportPdf' });
      };

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'div',
          { className: 'toolbar-container' },
          React.createElement(
            'div',
            { className: 'toolbar-content' },
            React.createElement(
                'div', 
                null,
                React.createElement('span', { className: 'toolbar-title' }, 'DebtCrasher Report'),
                React.createElement('span', { className: 'toolbar-date' }, reportDate)
            ),
            React.createElement('button', { type: 'button', className: 'btn-export', onClick: handleExport }, 'Export PDF')
          )
        ),
        React.createElement(
          'div',
          { className: 'page-container' },
          React.createElement(
             'div',
             { className: 'page' },
             React.createElement('div', {
               className: 'markdown-body',
               dangerouslySetInnerHTML: { __html: marked.parse(markdown) }
             })
          )
        )
      );
    };

    ReactDOM.createRoot(root).render(React.createElement(App));
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
