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
let sawActivated = false;
let sawContextMenu = false;
let sawWebviewViewCreate = false;
let sawWebviewViewHtml = false;
let sawProgressStart = false;
let sawProgressReport = false;
let sawProgressEnd = false;
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
    child.stdin.write(`${JSON.stringify(commandRequest)}\n`);
    sentCommand = true;
  }
}

function handleStdoutLine(line) {
  if (line.includes("Loaded 1 extension(s).")) {
    sendCommandRequest();
    return;
  }
  if (!line.startsWith("{")) {
    return;
  }

  const message = JSON.parse(line);
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
  if (message.kind === "response" && message.id === commandRequest.id) {
    handleCommandResponse(message);
  }
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
    sawProgressEnd
  ) {
    clearTimeout(timeout);
    console.log("Resolved VS Code API compatibility fixture through extension-host command IPC, webview view IPC, and progress IPC.");
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
    sawActivated ? "" : "extension.activated",
    sawContextMenu ? "" : "context-filtered menu contribution",
    sawWebviewViewCreate ? "" : "webviewView.create",
    sawWebviewViewHtml ? "" : "webviewView.setHtml",
    sawProgressStart ? "" : "workbench.progress.start",
    sawProgressReport ? "" : "workbench.progress.report",
    sawProgressEnd ? "" : "workbench.progress.end",
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
