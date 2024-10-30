"use strict";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("Extension activated");

  const provider = new CustomSidebarViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CustomSidebarViewProvider.viewType,
      provider
    )
  );

  let _statusBarItem: vscode.StatusBarItem;
  let errorLensEnabled: boolean = true;

  let disposableEnableErrorLens = vscode.commands.registerCommand(
    "SillyCat.enable",
    () => {
      errorLensEnabled = true;
      const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor;
      if (activeTextEditor) {
        updateDecorationsForUri(activeTextEditor.document.uri);
      }
    }
  );

  context.subscriptions.push(disposableEnableErrorLens);

  let disposableDisableErrorLens = vscode.commands.registerCommand(
    "SillyCat.disable",
    () => {
      errorLensEnabled = false;
      const activeTextEditor: vscode.TextEditor | undefined =
        vscode.window.activeTextEditor;
      if (activeTextEditor) {
        updateDecorationsForUri(activeTextEditor.document.uri);
      }
    }
  );

  context.subscriptions.push(disposableDisableErrorLens);

  vscode.languages.onDidChangeDiagnostics(
    (diagnosticChangeEvent) => {
      onChangedDiagnostics(diagnosticChangeEvent);
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidOpenTextDocument(
    (textDocument) => {
      updateDecorationsForUri(textDocument.uri);
    },
    null,
    context.subscriptions
  );

  vscode.window.onDidChangeActiveTextEditor(
    (textEditor) => {
      if (textEditor === undefined) {
        return;
      }
      updateDecorationsForUri(textEditor.document.uri);
    },
    null,
    context.subscriptions
  );

  function onChangedDiagnostics(
    diagnosticChangeEvent: vscode.DiagnosticChangeEvent
  ) {
    const activeTextEditor: vscode.TextEditor | undefined =
      vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    for (const uri of diagnosticChangeEvent.uris) {
      if (uri.fsPath === activeTextEditor.document.uri.fsPath) {
        updateDecorationsForUri(uri);
        break;
      }
    }
  }

  function updateDecorationsForUri(uriToDecorate: vscode.Uri) {
    if (!uriToDecorate || uriToDecorate.scheme !== "file") {
      return;
    }

    const activeTextEditor: vscode.TextEditor | undefined =
      vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }

    let numErrors = 0;
    let numWarnings = 0;

    if (errorLensEnabled) {
      let aggregatedDiagnostics: any = {};
      let diagnostic: vscode.Diagnostic;

      for (diagnostic of vscode.languages.getDiagnostics(uriToDecorate)) {
        let key = "line" + diagnostic.range.start.line;

        if (aggregatedDiagnostics[key]) {
          aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic);
        } else {
          aggregatedDiagnostics[key] = {
            line: diagnostic.range.start.line,
            arrayDiagnostics: [diagnostic],
          };
        }

        switch (diagnostic.severity) {
          case 0:
            numErrors += 1;
            break;
          case 1:
            numWarnings += 1;
            break;
        }
      }
    }
  }
}

class CustomSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "silly-cat.openview";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext<unknown>,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview, "0");

    setInterval(() => {
      const config = vscode.workspace.getConfiguration('SillyCat');
      const errorUseWarnings = config.get<boolean>('error.usewarnings');
      let [errors, warnings] = getNumErrors();
      if (errorUseWarnings) {errors += warnings / 2;}
      let i = "0";
      if (errors) {i = errors < 5 ? "1" : errors < 10 ? "2" : "3";}
      webviewView.webview.html = this.getHtmlContent(webviewView.webview, i);
    }, 1000);
  }

  private getHtmlContent(webview: vscode.Webview, i: string): string {
    const stylesheetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "assets", "main.css")
    );

    const catFace = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "assets", `cat${i}.png`)
    );

    return getHtml(catFace, stylesheetUri);
  }
}

function getHtml(catFace: vscode.Uri, stylesheetUri: vscode.Uri) {
  const [errorNum, errorWar] = getNumErrors();

  const config = vscode.workspace.getConfiguration('SillyCat');
  const errorUseWarnings = config.get<boolean>('error.usewarnings');

  if (errorUseWarnings === false) {
    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <link rel="stylesheet" href="${stylesheetUri}" />
      </head>
      <body>
        <section>
          <img src="${catFace}">
          <h2 class=${errorNum ? "alarm" : ""}>
            ${errorNum} ${errorNum === 1 ? "error" : "errors"}
          </h2>
        </section>
      </body>
    </html>
    `;
  }
  
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <link rel="stylesheet" href="${stylesheetUri}" />
      </head>
      <body>
        <section>
          <img src="${catFace}">
          <h2 class=${errorNum ? "alarm" : errorWar ? "yellow": ""}>
            ${errorNum} ${errorNum === 1 ? "error" : "errors"}
            ${errorWar} ${errorWar === 1 ? "warning" : "warnings"}
          </h2>
        </section>
      </body>
    </html>
  `;
}

function getNumErrors(): [number, number] {
  const activeTextEditor: vscode.TextEditor | undefined =
    vscode.window.activeTextEditor;
  if (!activeTextEditor) {
    return [0, 0];
  }
  const document: vscode.TextDocument = activeTextEditor.document;

  let numErrors = 0;
  let numWarnings = 0;

  let aggregatedDiagnostics: any = {};
  let diagnostic: vscode.Diagnostic;

  for (diagnostic of vscode.languages.getDiagnostics(document.uri)) {
    let key = "line" + diagnostic.range.start.line;

    if (aggregatedDiagnostics[key]) {
      aggregatedDiagnostics[key].arrayDiagnostics.push(diagnostic);
    } else {
      aggregatedDiagnostics[key] = {
        line: diagnostic.range.start.line,
        arrayDiagnostics: [diagnostic],
      };
    }

    switch (diagnostic.severity) {
      case 0:
        numErrors += 1;
        break;
      case 1:
        numWarnings += 1;
        break;
    }
  }

  return [numErrors, numWarnings];
}

export function deactivate() {}
