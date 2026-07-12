const fs = require("node:fs/promises");
const path = require("node:path");
const vscode = require("vscode");

exports.activate = function activate(context) {
  const phase3 = registerPhase3Compatibility(context);
  registerLanguageProviderCompatibility(context);
  const editorLifecycle = registerEditorLifecycleCompatibility(context);
  const activatedExports = { activated: true, fixture: "compat-extension", phase3 };

  context.subscriptions.push(
    vscode.commands.registerCommand("compat.fixture.extra", () => "extra-ok"),
    vscode.commands.registerCommand("compat.fixture.run", () => runCompatibilityFixture(context)),
    vscode.commands.registerCommand("compat.fixture.editorLifecycle", () => exerciseEditorLifecycle()),
    vscode.commands.registerCommand("compat.fixture.editorLifecycleStatus", () => editorLifecycle.snapshot())
  );

  return activatedExports;
};

async function runCompatibilityFixture(context) {
  const configurationChanges = [];
  const configurationDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    configurationChanges.push({
      compat: event.affectsConfiguration("compat"),
      smoke: event.affectsConfiguration("compat.smoke")
    });
  });

  const configuration = vscode.workspace.getConfiguration("compat");
  await configuration.update("smoke", "enabled");

  await vscode.commands.executeCommand("setContext", "compat.fixture.ready", true);
  await vscode.commands.executeCommand("setContext", "compat.fixture.mode", "smoke");

  const secretChanges = [];
  const secretDisposable = context.secrets.onDidChange((event) => secretChanges.push(event.key));
  await context.secrets.store("compat.token", "secret-value");
  const storedSecret = await context.secrets.get("compat.token");
  await context.secrets.delete("compat.token");
  const deletedSecret = await context.secrets.get("compat.token");
  secretDisposable.dispose();

  const watcherEvents = await exerciseWatcher();
  const uri = createUriCompatibility(context);
  const progress = await exerciseProgress();
  const commands = await vscode.commands.getCommands(true);
  const extension = vscode.extensions.getExtension("fixture.compat-extension");
  const activated = await extension?.activate();
  const extraCommandResult = await vscode.commands.executeCommand("compat.fixture.extra");

  configurationDisposable.dispose();

  return {
    configuration: {
      value: configuration.get("smoke"),
      changed: configurationChanges.some((change) => change.compat && change.smoke)
    },
    watcherEvents,
    secrets: {
      stored: storedSecret,
      deleted: deletedSecret === undefined,
      changedKeys: secretChanges
    },
    uri,
    progress,
    commands: {
      includesRun: commands.includes("compat.fixture.run"),
      includesExtra: commands.includes("compat.fixture.extra"),
      extraCommandResult
    },
    extension: {
      id: extension?.id,
      isActive: extension?.isActive,
      exports: activated
    }
  };
}

function registerEditorLifecycleCompatibility(context) {
  const state = {
    activeChanges: 0,
    selectionChanges: 0,
    documentChanges: 0,
    activeEditorId: undefined,
    activeDocumentId: undefined,
    lastSelection: undefined,
    lastChangedDocumentId: undefined,
    lastChangedVersion: undefined
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      state.activeChanges += 1;
      state.activeEditorId = editor?.id;
      state.activeDocumentId = editor?.document?.id;
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      state.selectionChanges += 1;
      state.lastSelection = serializeSelection(event.selection);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      state.documentChanges += 1;
      state.lastChangedDocumentId = event.document?.id;
      state.lastChangedVersion = event.document?.version;
    })
  );

  return {
    snapshot() {
      return { ...state };
    }
  };
}

async function exerciseEditorLifecycle() {
  const firstDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "select lifecycle_one"
  });
  const firstEditor = await vscode.window.showTextDocument(firstDocument);
  const secondDocument = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "select lifecycle_two"
  });
  const secondEditor = await vscode.window.showTextDocument(secondDocument, vscode.ViewColumn.Two);

  return {
    firstEditorId: firstEditor.id,
    firstDocumentId: firstDocument.id,
    secondEditorId: secondEditor.id,
    secondDocumentId: secondDocument.id,
    activeTextEditorId: vscode.window.activeTextEditor?.id,
    firstSelection: serializeSelection(firstEditor.selection),
    secondSelection: serializeSelection(secondEditor.selection)
  };
}

function serializeSelection(selection) {
  if (!selection) {
    return undefined;
  }
  return {
    start: { line: selection.start.line, character: selection.start.character },
    end: { line: selection.end.line, character: selection.end.character }
  };
}

function registerPhase3Compatibility(context) {
  const uri = createUriCompatibility(context);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider("compat.webviewView", {
    resolveWebviewView(view) {
      view.webview.html = [
        "<html><body>",
        "<h1>Compat Webview</h1>",
        `<p>${escapeHtml(uri.changedUri)}</p>`,
        "</body></html>"
      ].join("");
    }
  }));

  return {
    webviewViewId: "compat.webviewView",
    changedUri: uri.changedUri
  };
}

function registerLanguageProviderCompatibility(context) {
  const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 8));

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider("sql", {
      provideCompletionItems() {
        const item = new vscode.CompletionItem("compat_select", vscode.CompletionItemKind.Keyword);
        item.detail = "Compat SQL completion";
        item.documentation = new vscode.MarkdownString("Completion from compat fixture");
        item.insertText = "select";
        item.sortText = "0001";
        item.filterText = "compat_select";
        return new vscode.CompletionList([item], false);
      }
    }),
    vscode.languages.registerHoverProvider({ language: "sql", scheme: "file", pattern: "**/*.sql" }, {
      provideHover() {
        return new vscode.Hover(new vscode.MarkdownString("Compat SQL hover"), range);
      }
    }),
    vscode.languages.registerDocumentSymbolProvider("sql", {
      provideDocumentSymbols() {
        return [
          new vscode.DocumentSymbol(
            "compatQuery",
            "fixture",
            vscode.SymbolKind.Function,
            range,
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 6))
          )
        ];
      }
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider("sql", {
      provideDocumentRangeFormattingEdits(_document, requestedRange, options) {
        const prefix = options.insertSpaces ? "  " : "\t";
        return [vscode.TextEdit.replace(requestedRange, `${prefix}SELECT 1`)];
      }
    })
  );
}

function createUriCompatibility(context) {
  const mediaUri = vscode.Uri.joinPath(context.extensionUri, "media", "main.js");
  const changedUri = mediaUri.with({ query: "v=1" });
  const pattern = new vscode.RelativePattern(context.extensionUri, "**/*.{json,js}");

  return {
    mediaUri: mediaUri.toString(),
    changedUri: changedUri.toString(),
    patternBase: pattern.base,
    patternBaseUri: pattern.baseUri.toString(),
    pattern: pattern.pattern
  };
}

async function exerciseProgress() {
  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Compat Progress",
    cancellable: true
  }, async (progress, token) => {
    const message = token.isCancellationRequested ? "cancelled" : "running";
    progress.report({ message, increment: 25 });
    return {
      message,
      increment: 25,
      tokenIsCancellationRequested: token.isCancellationRequested,
      hasCancellationEvent: typeof token.onCancellationRequested === "function"
    };
  });
}

async function exerciseWatcher() {
  const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(vscode.workspace.rootPath);
  const root = rootUri.fsPath;
  const filePath = path.join(root, "compat-fixture.compat");
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(rootUri, "**/*.compat"));
  const events = [];

  watcher.onDidCreate((uri) => events.push({ type: "create", path: uri.fsPath }));
  watcher.onDidChange((uri) => events.push({ type: "change", path: uri.fsPath }));
  watcher.onDidDelete((uri) => events.push({ type: "delete", path: uri.fsPath }));

  try {
    await fs.mkdir(root, { recursive: true });
    await delay(100);

    const created = waitForEvent(events, "create");
    await fs.writeFile(filePath, "one", "utf8");
    await created;

    const changed = waitForEvent(events, "change");
    await fs.writeFile(filePath, "two", "utf8");
    await changed;

    const deleted = waitForEvent(events, "delete");
    await fs.rm(filePath, { force: true });
    await deleted;

    return events;
  } finally {
    watcher.dispose();
    await fs.rm(filePath, { force: true });
  }
}

function waitForEvent(events, type) {
  if (events.some((event) => event.type === type)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timed out waiting for watcher ${type} event`));
    }, 5000);
    const interval = setInterval(() => {
      if (events.some((event) => event.type === type)) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }
    }, 25);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
