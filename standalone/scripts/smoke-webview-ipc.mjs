import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const extensionsDir = path.join(standaloneRoot, "extensions");
const storageRoot = path.join(standaloneRoot, ".data");
const executeCommandRequest = {
  kind: "request",
  id: "smoke-webview-open",
  group: "command.execute",
  payload: { command: "airdb.connection.add" }
};
const webviewInitRequest = {
  kind: "request",
  id: "smoke-webview-init",
  group: "webview.receiveMessage",
  payload: { panelId: "", message: { type: "init" } }
};

const child = spawn("node", [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sentOpen = false;
let webviewPanelId = "";
let sawHtml = false;
let sawResource = false;
let sentInit = false;
let sawInitDelivered = false;
let sawSyncState = false;
let stderr = "";

const timeout = setTimeout(() => {
  child.kill();
  console.error("Timed out waiting for webview IPC smoke response.");
  console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
}, 15000);

function sendOpenRequest() {
  if (!sentOpen) {
    child.stdin.write(`${JSON.stringify(executeCommandRequest)}\n`);
    sentOpen = true;
  }
}

function sendInitIfReady() {
  if (!sentInit && webviewPanelId && sawHtml && sawResource) {
    webviewInitRequest.payload.panelId = webviewPanelId;
    child.stdin.write(`${JSON.stringify(webviewInitRequest)}\n`);
    sentInit = true;
  }
}

function missingCheckpoints() {
  return [
    webviewPanelId ? "" : "webview.create",
    sawHtml ? "" : "webview.setHtml",
    sawResource ? "" : "standalone-resource URI",
    sentInit && sawInitDelivered ? "" : "webview.receiveMessage delivery",
    sawSyncState ? "" : "webview.postMessage syncState"
  ].filter(Boolean);
}

function finishIfReady() {
  if (webviewPanelId && sawHtml && sawResource && sawInitDelivered && sawSyncState) {
    clearTimeout(timeout);
    console.log(`Opened ${webviewPanelId} with local webview resources and syncState handshake.`);
    child.kill();
  }
}

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).")) {
    sendOpenRequest();
  }
});

child.stdout.on("data", (chunk) => {
  for (const rawLine of chunk.toString().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.includes("Loaded 1 extension(s).")) {
      sendOpenRequest();
      continue;
    }
    if (!line.startsWith("{")) {
      continue;
    }

    const message = JSON.parse(line);
    if (message.kind === "notification" && message.group === "webview.create") {
      webviewPanelId = message.payload.panelId;
    }
    if (message.kind === "notification" && message.group === "webview.setHtml") {
      sawHtml = Boolean(message.payload.html);
      sawResource = String(message.payload.html).includes("standalone-resource://");
    }
    if (message.kind === "response" && message.id === webviewInitRequest.id) {
      if (!message.ok) {
        console.error(message.error);
        child.kill();
        process.exit(1);
      }
      sawInitDelivered = message.payload?.delivered === true;
    }
    if (
      message.kind === "notification" &&
      message.group === "webview.postMessage" &&
      message.payload?.panelId === webviewPanelId &&
      message.payload?.message?.type === "syncState"
    ) {
      sawSyncState = true;
    }
    sendInitIfReady();
    finishIfReady();
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!webviewPanelId || !sawHtml || !sawResource || !sawInitDelivered || !sawSyncState) {
    console.error(`Extension host exited before webview smoke completed. Exit code: ${code}`);
    console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
    if (stderr) {
      console.error(stderr);
    }
    process.exit(1);
  }
});
