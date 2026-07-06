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
let stderr = "";

const timeout = setTimeout(() => {
  child.kill();
  console.error("Timed out waiting for webview IPC smoke response.");
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

function finishIfReady() {
  if (webviewPanelId && sawHtml && sawResource) {
    clearTimeout(timeout);
    console.log(`Opened ${webviewPanelId} with local webview resources.`);
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
    finishIfReady();
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!webviewPanelId || !sawHtml || !sawResource) {
    console.error(`Extension host exited before webview smoke completed. Exit code: ${code}`);
    if (stderr) {
      console.error(stderr);
    }
    process.exit(1);
  }
});
