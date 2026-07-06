import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-text-document-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "text-document-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const commandRequest = {
  kind: "request",
  id: "smoke-text-document-command",
  group: "command.execute",
  payload: { command: "fixture.textDocument.open" }
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
let sawShowDocument = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for text document IPC smoke response.");
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
      console.error(`Extension host exited before text document smoke completed. Exit code: ${code}`);
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
  if (message.kind === "request" && message.group === "editor.showDocument") {
    sawShowDocument = true;
    const document = message.payload?.document;
    if (document?.languageId !== "sql" || document?.content !== "select 1") {
      void fail(`Unexpected text document payload: ${JSON.stringify(message.payload)}`);
      return;
    }
    writeResponse(message, {
      document,
      viewColumn: message.payload?.viewColumn
    });
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
    void fail(message.error ?? "Text document command failed.");
    return;
  }
  if (
    message.payload?.languageId !== "sql" ||
    message.payload?.text !== "select 1" ||
    message.payload?.active !== "select 1"
  ) {
    void fail(`Unexpected text document command payload: ${JSON.stringify(message.payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved text document through IPC with active editor content.");
  child.kill();
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
    sawShowDocument ? "" : "editor.showDocument",
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
      name: "text-document-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.textDocument.open",
            title: "Text Document Open"
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
    vscode.commands.registerCommand("fixture.textDocument.open", async () => {
      const document = await vscode.workspace.openTextDocument({
        language: "sql",
        content: "select 1"
      });
      const editor = await vscode.window.showTextDocument(document);
      return {
        languageId: editor.document.languageId,
        text: editor.document.getText(),
        active: vscode.window.activeTextEditor?.document.getText()
      };
    })
  );
};
`
  );
}
