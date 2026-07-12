import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const extensionsDir = path.join(standaloneRoot, "extension-host", "test", "fixtures-compat");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-vscode-api-compat-smoke-"));
const storageRoot = path.join(smokeRoot, "storage");
const workspaceRoot = path.join(smokeRoot, "workspace");
const commandRequest = {
  kind: "request",
  id: "smoke-vscode-api-compat-command",
  group: "command.execute",
  payload: { command: "compat.fixture.run" }
};
const lifecycleCommandRequest = {
  kind: "request",
  id: "smoke-vscode-api-compat-editor-lifecycle",
  group: "command.execute",
  payload: { command: "compat.fixture.editorLifecycle" }
};
const lifecycleStatusRequest = {
  kind: "request",
  id: "smoke-vscode-api-compat-editor-lifecycle-status",
  group: "command.execute",
  payload: { command: "compat.fixture.editorLifecycleStatus" }
};
const sqlDocument = {
  id: "smoke-language-sql",
  uri: "file:///C:/workspace/query.sql",
  fsPath: "C:/workspace/query.sql",
  fileName: "C:/workspace/query.sql",
  title: "query.sql",
  languageId: "sql",
  content: "select 1",
  isUntitled: false,
  version: 1
};
const languageRequests = [
  {
    kind: "request",
    id: "smoke-vscode-api-compat-language-completion",
    group: "language.provideCompletionItems",
    payload: {
      document: sqlDocument,
      position: { line: 0, character: 3 },
      context: { triggerKind: 1 }
    }
  },
  {
    kind: "request",
    id: "smoke-vscode-api-compat-language-hover",
    group: "language.provideHover",
    payload: {
      document: sqlDocument,
      position: { line: 0, character: 1 }
    }
  },
  {
    kind: "request",
    id: "smoke-vscode-api-compat-language-symbols",
    group: "language.provideDocumentSymbols",
    payload: { document: sqlDocument }
  },
  {
    kind: "request",
    id: "smoke-vscode-api-compat-language-formatting",
    group: "language.provideDocumentRangeFormattingEdits",
    payload: {
      document: sqlDocument,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
      options: { tabSize: 2, insertSpaces: true }
    }
  }
];

await fs.access(hostEntry);
await fs.access(path.join(extensionsDir, "compat-extension", "package.json"));
await fs.mkdir(storageRoot, { recursive: true });
await fs.mkdir(workspaceRoot, { recursive: true });

const child = spawn(process.execPath, [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot,
    AIRDB_STANDALONE_WORKSPACE: workspaceRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sentCommand = false;
let sentLanguageRequests = false;
let sentLifecycleCommand = false;
let sentLifecycleUiNotifications = false;
let sentLifecycleStatus = false;
let sawActivated = false;
let sawContextMenu = false;
let sawWebviewViewCreate = false;
let sawWebviewViewHtml = false;
let sawProgressStart = false;
let sawProgressReport = false;
let sawProgressEnd = false;
let sawCompletion = false;
let sawHover = false;
let sawDocumentSymbols = false;
let sawFormatting = false;
let sawEditorSessionOpened = false;
let sawEditorActiveChanged = false;
let lifecycleCommandPayload;
let sawEditorLifecycleStatus = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for VS Code API compatibility smoke response.");
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).")) {
    sendCommandRequest();
    sendLanguageRequests();
  }
});

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString();
  while (true) {
    const lineEnd = stdoutBuffer.indexOf("\n");
    if (lineEnd === -1) {
      break;
    }
    const line = stdoutBuffer.slice(0, lineEnd).trim();
    stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
    if (line) {
      handleStdoutLine(line);
    }
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  void cleanup().then(() => {
    if (!resolved || !sawActivated || !sawContextMenu) {
      console.error(`Extension host exited before VS Code API compatibility smoke completed. Exit code: ${code}`);
      console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
      if (stderr) {
        console.error(stderr);
      }
      process.exit(1);
    }
  });
});

function sendCommandRequest() {
  if (!sentCommand) {
    writeHostMessage(commandRequest);
    sentCommand = true;
  }
}

function sendLanguageRequests() {
  if (!sentLanguageRequests) {
    for (const request of languageRequests) {
      writeHostMessage(request);
    }
    sentLanguageRequests = true;
  }
}

function sendLifecycleCommandRequest() {
  if (!sentLifecycleCommand) {
    writeHostMessage(lifecycleCommandRequest);
    sentLifecycleCommand = true;
  }
}

function sendLifecycleUiNotifications() {
  if (sentLifecycleUiNotifications || !lifecycleCommandPayload?.firstEditorId) {
    return;
  }

  writeHostMessage({
    kind: "notification",
    group: "editor.ui.activate",
    payload: { editorId: lifecycleCommandPayload.firstEditorId }
  });
  writeHostMessage({
    kind: "notification",
    group: "editor.ui.selection",
    payload: {
      editorId: lifecycleCommandPayload.firstEditorId,
      selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }
    }
  });
  sentLifecycleUiNotifications = true;
  sendLifecycleStatusRequest();
}

function sendLifecycleStatusRequest() {
  if (!sentLifecycleStatus) {
    writeHostMessage(lifecycleStatusRequest);
    sentLifecycleStatus = true;
  }
}

function writeHostMessage(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function handleStdoutLine(line) {
  if (line.includes("Loaded 1 extension(s).")) {
    sendCommandRequest();
    sendLanguageRequests();
    return;
  }
  if (!line.startsWith("{")) {
    return;
  }

  const message = JSON.parse(line);
  if (message.kind === "request" && message.group === "editor.showDocument") {
    handleEditorShowDocumentRequest(message);
    return;
  }
  if (
    message.kind === "notification" &&
    message.group === "extension.activated" &&
    message.payload?.loaded?.includes("fixture.compat-extension")
  ) {
    sawActivated = true;
    finishIfReady();
    return;
  }
  if (message.kind === "notification" && message.group === "extension.registerContributions") {
    sawContextMenu = hasEnabledCompatMenu(message.payload);
    finishIfReady();
    return;
  }
  if (message.kind === "notification" && message.group === "editor.session.opened") {
    sawEditorSessionOpened = sawEditorSessionOpened || typeof message.payload?.id === "string";
    finishIfReady();
    return;
  }
  if (message.kind === "notification" && message.group === "editor.active.changed") {
    sawEditorActiveChanged = sawEditorActiveChanged || typeof message.payload?.editorId === "string";
    finishIfReady();
    return;
  }
  if (message.kind === "notification" && message.group === "extension.diagnostics") {
    if (hasUnsupportedWebviewProviderDiagnostic(message.payload)) {
      void fail("Unexpected unsupported diagnostic for window.registerWebviewViewProvider.");
    }
    return;
  }
  if (message.kind === "notification" && message.group === "webviewView.create") {
    sawWebviewViewCreate = sawWebviewViewCreate || message.payload?.viewId === "compat.webviewView";
    finishIfReady();
    return;
  }
  if (message.kind === "notification" && message.group === "webviewView.setHtml") {
    sawWebviewViewHtml = sawWebviewViewHtml || typeof message.payload?.html === "string" &&
      message.payload.html.includes("Compat Webview");
    finishIfReady();
    return;
  }
  if (message.kind === "notification" && message.group === "workbench.progress.start") {
    sawProgressStart = sawProgressStart ||
      message.payload?.title === "Compat Progress" && message.payload?.cancellable === true;
    finishIfReady();
    return;
  }
  if (message.kind === "notification" && message.group === "workbench.progress.report") {
    sawProgressReport = sawProgressReport ||
      message.payload?.message === "running" && message.payload?.increment === 25;
    finishIfReady();
    return;
  }
  if (message.kind === "notification" && message.group === "workbench.progress.end") {
    sawProgressEnd = sawProgressEnd || typeof message.payload?.id === "string";
    finishIfReady();
    return;
  }
  if (message.kind === "response" && message.id.startsWith("smoke-vscode-api-compat-language-")) {
    handleLanguageResponse(message);
    return;
  }
  if (message.kind === "response" && message.id === lifecycleCommandRequest.id) {
    handleLifecycleCommandResponse(message);
    return;
  }
  if (message.kind === "response" && message.id === lifecycleStatusRequest.id) {
    handleLifecycleStatusResponse(message);
    return;
  }
  if (message.kind === "response" && message.id === commandRequest.id) {
    handleCommandResponse(message);
  }
}

function handleEditorShowDocumentRequest(message) {
  const document = message.payload?.document;
  if (!document?.id) {
    void fail(`Invalid editor.showDocument smoke request: ${JSON.stringify(message.payload)}`);
    return;
  }

  writeHostMessage({
    kind: "response",
    id: message.id,
    group: message.group,
    extensionId: message.extensionId,
    ok: true,
    payload: {
      id: `editor:${document.id}`,
      document,
      ...(typeof message.payload?.viewColumn === "number" ? { viewColumn: message.payload.viewColumn } : {}),
      selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
    }
  });
}

function handleLanguageResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Language provider smoke request failed.");
    return;
  }

  switch (message.id) {
    case "smoke-vscode-api-compat-language-completion":
      sawCompletion = isValidCompletionPayload(message.payload);
      break;
    case "smoke-vscode-api-compat-language-hover":
      sawHover = isValidHoverPayload(message.payload);
      break;
    case "smoke-vscode-api-compat-language-symbols":
      sawDocumentSymbols = isValidDocumentSymbolsPayload(message.payload);
      break;
    case "smoke-vscode-api-compat-language-formatting":
      sawFormatting = isValidFormattingPayload(message.payload);
      break;
  }
  finishIfReady();
}

function handleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "VS Code API compatibility command failed.");
    return;
  }

  const payload = message.payload ?? {};
  if (!isValidCompatibilityPayload(payload)) {
    void fail(`Unexpected VS Code API compatibility payload: ${JSON.stringify(payload)}`);
    return;
  }

  resolved = true;
  sendLifecycleCommandRequest();
  finishIfReady();
}

function handleLifecycleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Editor lifecycle command failed.");
    return;
  }
  if (!isValidLifecycleCommandPayload(message.payload)) {
    void fail(`Unexpected editor lifecycle command payload: ${JSON.stringify(message.payload)}`);
    return;
  }

  lifecycleCommandPayload = message.payload;
  sendLifecycleUiNotifications();
  finishIfReady();
}

function handleLifecycleStatusResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Editor lifecycle status command failed.");
    return;
  }
  if (!isValidLifecycleStatusPayload(message.payload)) {
    void fail(`Unexpected editor lifecycle status payload: ${JSON.stringify(message.payload)}`);
    return;
  }

  sawEditorLifecycleStatus = true;
  finishIfReady();
}

function isValidCompatibilityPayload(payload) {
  const watcherEvents = Array.isArray(payload.watcherEvents) ? payload.watcherEvents : [];
  const watcherTypes = watcherEvents.map((event) => event.type);

  return (
    payload.configuration?.value === "enabled" &&
    payload.configuration?.changed === true &&
    watcherTypes.includes("create") &&
    watcherTypes.includes("change") &&
    watcherTypes.includes("delete") &&
    watcherEvents.every((event) => samePath(event.path, path.join(workspaceRoot, "compat-fixture.compat"))) &&
    payload.secrets?.stored === "secret-value" &&
    payload.secrets?.deleted === true &&
    Array.isArray(payload.secrets?.changedKeys) &&
    payload.secrets.changedKeys.join(",") === "compat.token,compat.token" &&
    isValidUriCompatibilityPayload(payload.uri) &&
    payload.progress?.message === "running" &&
    payload.progress?.increment === 25 &&
    payload.progress?.tokenIsCancellationRequested === false &&
    payload.progress?.hasCancellationEvent === true &&
    payload.commands?.includesRun === true &&
    payload.commands?.includesExtra === true &&
    payload.commands?.extraCommandResult === "extra-ok" &&
    payload.extension?.id === "fixture.compat-extension" &&
    payload.extension?.isActive === true &&
    payload.extension?.exports?.activated === true &&
    payload.extension?.exports?.fixture === "compat-extension"
  );
}

function isValidLifecycleCommandPayload(payload) {
  return (
    typeof payload?.firstEditorId === "string" &&
    payload.firstEditorId.startsWith("editor:") &&
    typeof payload?.secondEditorId === "string" &&
    payload.secondEditorId.startsWith("editor:") &&
    payload.firstEditorId !== payload.secondEditorId &&
    typeof payload?.firstDocumentId === "string" &&
    typeof payload?.secondDocumentId === "string" &&
    payload.activeTextEditorId === payload.secondEditorId &&
    payload.firstSelection?.start?.line === 0 &&
    payload.firstSelection?.end?.character === 0 &&
    payload.secondSelection?.start?.line === 0 &&
    payload.secondSelection?.end?.character === 0
  );
}

function isValidLifecycleStatusPayload(payload) {
  return (
    lifecycleCommandPayload &&
    payload?.activeEditorId === lifecycleCommandPayload.firstEditorId &&
    payload?.activeDocumentId === lifecycleCommandPayload.firstDocumentId &&
    payload?.activeChanges >= 3 &&
    payload?.selectionChanges >= 1 &&
    payload?.lastSelection?.start?.line === 0 &&
    payload?.lastSelection?.start?.character === 0 &&
    payload?.lastSelection?.end?.line === 0 &&
    payload?.lastSelection?.end?.character === 6
  );
}

function isValidCompletionPayload(payload) {
  const item = Array.isArray(payload?.items)
    ? payload.items.find((entry) => entry.label === "compat_select")
    : undefined;
  return Boolean(item) &&
    item.kind === 13 &&
    item.detail === "Compat SQL completion" &&
    item.documentation?.value === "Completion from compat fixture" &&
    item.insertText === "select" &&
    item.sortText === "0001" &&
    item.filterText === "compat_select" &&
    payload.isIncomplete === false;
}

function isValidHoverPayload(payload) {
  const hover = Array.isArray(payload?.hovers) ? payload.hovers[0] : undefined;
  return Boolean(hover) &&
    Array.isArray(hover.contents) &&
    hover.contents[0]?.value === "Compat SQL hover" &&
    hover.range?.start?.line === 0 &&
    hover.range?.end?.character === 8;
}

function isValidDocumentSymbolsPayload(payload) {
  const symbol = Array.isArray(payload?.symbols) ? payload.symbols[0] : undefined;
  return Boolean(symbol) &&
    symbol.name === "compatQuery" &&
    symbol.detail === "fixture" &&
    symbol.kind === 11 &&
    symbol.range?.start?.line === 0 &&
    Array.isArray(symbol.children);
}

function isValidFormattingPayload(payload) {
  const edit = Array.isArray(payload?.edits) ? payload.edits[0] : undefined;
  return Boolean(edit) &&
    edit.newText === "  SELECT 1" &&
    edit.range?.start?.character === 0 &&
    edit.range?.end?.character === 8;
}

function isValidUriCompatibilityPayload(uri) {
  return (
    typeof uri?.mediaUri === "string" &&
    uri.mediaUri.includes("/media/main.js") &&
    typeof uri?.changedUri === "string" &&
    uri.changedUri.includes("/media/main.js") &&
    uri.changedUri.includes("?v=1") &&
    typeof uri?.patternBase === "string" &&
    uri.patternBase.length > 0 &&
    typeof uri?.patternBaseUri === "string" &&
    uri.patternBaseUri.length > 0 &&
    uri.pattern === "**/*.{json,js}"
  );
}

function hasEnabledCompatMenu(payload) {
  const context = payload?.context ?? {};
  const menuItems = payload?.menus?.commandPalette;
  if (context["compat.fixture.ready"] !== true || context["compat.fixture.mode"] !== "smoke") {
    return false;
  }
  if (!Array.isArray(menuItems)) {
    return false;
  }
  const commands = menuItems.map((item) => item.command);
  return commands.includes("compat.fixture.run") && commands.includes("compat.fixture.extra");
}

function finishIfReady() {
  if (
    resolved &&
    sawActivated &&
    sawContextMenu &&
    sawWebviewViewCreate &&
    sawWebviewViewHtml &&
    sawProgressStart &&
    sawProgressReport &&
    sawProgressEnd &&
    sawCompletion &&
    sawHover &&
    sawDocumentSymbols &&
    sawFormatting &&
    sawEditorSessionOpened &&
    sawEditorActiveChanged &&
    sawEditorLifecycleStatus
  ) {
    clearTimeout(timeout);
    console.log("Resolved VS Code API compatibility fixture through command IPC, webview view IPC, progress IPC, language provider IPC, and editor lifecycle IPC.");
    child.kill();
  }
}

function hasUnsupportedWebviewProviderDiagnostic(payload) {
  const extensions = Array.isArray(payload?.extensions) ? payload.extensions : [];
  return extensions.some((extension) =>
    Array.isArray(extension?.events) &&
    extension.events.some((event) =>
      event?.phase === "unsupportedApi" &&
      event?.details?.api === "window.registerWebviewViewProvider"
    )
  );
}

function samePath(actual, expected) {
  return typeof actual === "string" && normalizePath(actual) === normalizePath(path.resolve(expected));
}

function normalizePath(value) {
  return path.resolve(value).replace(/\\/g, "/");
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
    sentLanguageRequests ? "" : "language provider requests",
    sawActivated ? "" : "extension.activated",
    sawContextMenu ? "" : "context-filtered menu contribution",
    sawWebviewViewCreate ? "" : "webviewView.create",
    sawWebviewViewHtml ? "" : "webviewView.setHtml",
    sawProgressStart ? "" : "workbench.progress.start",
    sawProgressReport ? "" : "workbench.progress.report",
    sawProgressEnd ? "" : "workbench.progress.end",
    sawCompletion ? "" : "language.provideCompletionItems",
    sawHover ? "" : "language.provideHover",
    sawDocumentSymbols ? "" : "language.provideDocumentSymbols",
    sawFormatting ? "" : "language.provideDocumentRangeFormattingEdits",
    sentLifecycleCommand ? "" : "compat.fixture.editorLifecycle command",
    sawEditorSessionOpened ? "" : "editor.session.opened",
    sawEditorActiveChanged ? "" : "editor.active.changed",
    sentLifecycleUiNotifications ? "" : "editor.ui activate/selection notifications",
    sentLifecycleStatus ? "" : "compat.fixture.editorLifecycleStatus command",
    sawEditorLifecycleStatus ? "" : "editor lifecycle event status",
    resolved ? "" : "compat command response"
  ].filter(Boolean);
}

async function fail(message) {
  clearTimeout(timeout);
  child.kill();
  console.error(message);
  console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
  if (stderr) {
    console.error(stderr);
  }
  await cleanup();
  process.exit(1);
}

async function cleanup() {
  try {
    await fs.rm(smokeRoot, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup should not hide the smoke result.
  }
}
