import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-external-actions-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "external-actions-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const fileToOpen = "C:/fixture/export.sql";
const externalUrl = "https://example.com/docs";
const clipboardText = "copied-sql";
const commandRequest = {
  kind: "request",
  id: "smoke-external-actions-command",
  group: "command.execute",
  payload: { command: "fixture.externalActions.run" }
};

await prepareFixtureExtension();

const child = spawn("node", [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sentCommand = false;
let sawClipboardWrite = false;
let sawClipboardRead = false;
let sawFileOpen = false;
let sawExternalOpen = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for external actions IPC smoke response.");
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
    if (!resolved) {
      console.error(`Extension host exited before external actions smoke completed. Exit code: ${code}`);
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
  if (message.kind === "request" && message.group === "external.writeClipboard") {
    sawClipboardWrite = true;
    if (message.payload?.text !== clipboardText) {
      void fail(`Unexpected clipboard write payload: ${JSON.stringify(message.payload)}`);
      return;
    }
    writeResponse(message, true);
    return;
  }
  if (message.kind === "request" && message.group === "external.readClipboard") {
    sawClipboardRead = true;
    writeResponse(message, clipboardText);
    return;
  }
  if (message.kind === "request" && message.group === "external.openUri") {
    const uri = message.payload?.uri;
    if (uri?.scheme === "file") {
      sawFileOpen = true;
      if (uri.fsPath !== fileToOpen) {
        void fail(`Unexpected file open payload: ${JSON.stringify(message.payload)}`);
        return;
      }
      writeResponse(message, true);
      return;
    }
    if (uri?.scheme === "https") {
      sawExternalOpen = true;
      if (uri.uri !== externalUrl) {
        void fail(`Unexpected external open payload: ${JSON.stringify(message.payload)}`);
        return;
      }
      writeResponse(message, true);
      return;
    }
    void fail(`Unexpected external URI payload: ${JSON.stringify(message.payload)}`);
    return;
  }
  if (message.kind === "response" && message.id === commandRequest.id) {
    handleCommandResponse(message);
  }
}

function writeResponse(request, payload) {
  child.stdin.write(`${JSON.stringify({
    kind: "response",
    id: request.id,
    group: request.group,
    extensionId: request.extensionId,
    ok: true,
    payload
  })}\n`);
}

function handleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "External actions command failed.");
    return;
  }
  const expected = {
    copied: clipboardText,
    openedFile: true,
    openedExternal: true
  };
  if (JSON.stringify(message.payload) !== JSON.stringify(expected)) {
    void fail(`Unexpected external actions command payload: ${JSON.stringify(message.payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved external open and clipboard actions through IPC.");
  child.kill();
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
    sawClipboardWrite ? "" : "external.writeClipboard",
    sawClipboardRead ? "" : "external.readClipboard",
    sawFileOpen ? "" : "external.openUri(file)",
    sawExternalOpen ? "" : "external.openUri(https)",
    resolved ? "" : "command response"
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

async function prepareFixtureExtension() {
  await fs.mkdir(path.join(extensionDir, "out"), { recursive: true });
  await fs.mkdir(storageRoot, { recursive: true });
  await fs.writeFile(
    path.join(extensionDir, "package.json"),
    `${JSON.stringify({
      name: "external-actions-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.externalActions.run",
            title: "External Actions Run"
          }
        ]
      }
    }, null, 2)}\n`
  );
  await fs.writeFile(
    path.join(extensionDir, "out", "extension.js"),
    `const vscode = require("vscode");

exports.activate = function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("fixture.externalActions.run", async () => {
      await vscode.env.clipboard.writeText("${clipboardText}");
      const copied = await vscode.env.clipboard.readText();
      const openedFile = await vscode.commands.executeCommand("vscode.open", vscode.Uri.file("${fileToOpen}"));
      const openedExternal = await vscode.env.openExternal(vscode.Uri.parse("${externalUrl}"));
      return { copied, openedFile, openedExternal };
    })
  );
};
`
  );
}
