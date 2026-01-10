import * as vscode from "vscode";

export function openReportWebview(
  context: vscode.ExtensionContext,
  markdown: string
): void {
  const panel = vscode.window.createWebviewPanel(
    "debtcrasherReport",
    "DebtCrasher Report",
    vscode.ViewColumn.One,
    {
      enableScripts: true
    }
  );

  panel.webview.html = getWebviewHtml(context, markdown);
}

function getWebviewHtml(
  context: vscode.ExtensionContext,
  markdown: string
): string {
  const nonce = createNonce();
  const content = JSON.stringify(markdown);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; script-src 'nonce-${nonce}' https:;" />
  <title>DebtCrasher Report</title>
  <style>
    body {
      font-family: "Segoe UI", sans-serif;
      margin: 0;
      background: #f5f5f7;
    }
    .page {
      max-width: 820px;
      margin: 24px auto;
      padding: 32px 40px;
      background: #ffffff;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
      border-radius: 8px;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .toolbar button {
      border: 1px solid #d0d7de;
      background: #f6f8fa;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .markdown-body h1,
    .markdown-body h2,
    .markdown-body h3 {
      margin-top: 24px;
    }
    .markdown-body ul {
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script nonce="${nonce}" src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script nonce="${nonce}" src="https://unpkg.com/marked/marked.min.js"></script>
  <script nonce="${nonce}">
    const markdown = ${content};
    const root = document.getElementById('root');
    const element = React.createElement(
      'div',
      { className: 'page' },
      React.createElement(
        'div',
        { className: 'toolbar' },
        React.createElement('strong', null, 'DebtCrasher Report'),
        React.createElement('button', { type: 'button' }, 'Export PDF')
      ),
      React.createElement('div', {
        className: 'markdown-body',
        dangerouslySetInnerHTML: { __html: marked.parse(markdown) }
      })
    );
    ReactDOM.createRoot(root).render(element);
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
