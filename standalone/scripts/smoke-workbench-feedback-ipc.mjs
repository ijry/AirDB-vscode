import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-workbench-feedback-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "workbench-feedback-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const statusCommandRequest = {
  kind: "request",
  id: "smoke-workbench-feedback-status-command",
  group: "command.execute",
  payload: { command: "fixture.feedback.status", arguments: ["clicked"] }
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

let sentStatusCommand = false;
let sawOutputCreate = false;
let sawOutputAppend = false;
let sawOutputClear = false;
let sawOutputShow = false;
let sawStatusShow = false;
let sawTerminalCreate = false;
let sawTerminalAppend = false;
let sawTerminalShow = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for workbench feedback IPC smoke response.");
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).")) {
    sendStatusCommandRequest();
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
      console.error(`Extension host exited before workbench feedback smoke completed. Exit code: ${code}`);
      console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
      if (stderr) {
        console.error(stderr);
      }
      process.exit(1);
    }
  });
});

function sendStatusCommandRequest() {
  if (!sentStatusCommand) {
    child.stdin.write(`${JSON.stringify(statusCommandRequest)}\n`);
    sentStatusCommand = true;
  }
}

function handleStdoutLine(line) {
  if (line.includes("Loaded 1 extension(s).")) {
    sendStatusCommandRequest();
    return;
  }
  if (!line.startsWith("{")) {
    return;
  }

  const message = JSON.parse(line);
  if (message.kind === "notification") {
    handleNotification(message);
    return;
  }
  if (message.kind === "response" && message.id === statusCommandRequest.id) {
    handleCommandResponse(message);
  }
}

function handleNotification(message) {
  const payload = message.payload ?? {};
  if (message.group === "workbench.output.create") {
    sawOutputCreate = payload.name === "Feedback";
    return;
  }
  if (message.group === "workbench.output.append") {
    if (payload.value === "final-line\n") {
      sawOutputAppend = true;
    }
    return;
  }
  if (message.group === "workbench.output.clear") {
    sawOutputClear = true;
    return;
  }
  if (message.group === "workbench.output.show") {
    sawOutputShow = payload.name === "Feedback" && payload.visible === true;
    return;
  }
  if (message.group === "workbench.statusBar.show") {
    sawStatusShow = payload.text === "$(database) Feedback" &&
      payload.command?.command === "fixture.feedback.status";
    return;
  }
  if (message.group === "workbench.terminal.create") {
    sawTerminalCreate = payload.name === "Feedback Terminal";
    return;
  }
  if (message.group === "workbench.terminal.append") {
    sawTerminalAppend = payload.value === "select 1";
    return;
  }
  if (message.group === "workbench.terminal.show") {
    sawTerminalShow = payload.name === "Feedback Terminal" && payload.visible === true;
  }
}

function handleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Workbench feedback status command failed.");
    return;
  }
  if (message.payload !== "status-clicked") {
    void fail(`Unexpected status command payload: ${JSON.stringify(message.payload)}`);
    return;
  }
  const missingBeforeResolve = missingCheckpoints().filter((checkpoint) => checkpoint !== "command response");
  if (missingBeforeResolve.length > 0) {
    void fail(`Status command resolved before checkpoint(s): ${missingBeforeResolve.join(", ")}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved workbench feedback APIs through IPC.");
  child.kill();
}

function missingCheckpoints() {
  return [
    sentStatusCommand ? "" : "command.execute",
    sawOutputCreate ? "" : "workbench.output.create",
    sawOutputAppend ? "" : "workbench.output.append",
    sawOutputClear ? "" : "workbench.output.clear",
    sawOutputShow ? "" : "workbench.output.show",
    sawStatusShow ? "" : "workbench.statusBar.show",
    sawTerminalCreate ? "" : "workbench.terminal.create",
    sawTerminalAppend ? "" : "workbench.terminal.append",
    sawTerminalShow ? "" : "workbench.terminal.show",
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
      name: "workbench-feedback-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.feedback.status",
            title: "Feedback Status"
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
    vscode.commands.registerCommand("fixture.feedback.status", (value) => \`status-\${value}\`)
  );

  const output = vscode.window.createOutputChannel("Feedback");
  output.appendLine("discarded");
  output.clear();
  output.appendLine("final-line");
  output.show();

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = "$(database) Feedback";
  item.tooltip = "Run feedback command";
  item.command = { command: "fixture.feedback.status", title: "Feedback Status", arguments: ["clicked"] };
  item.show();

  const terminal = vscode.window.createTerminal({ name: "Feedback Terminal" });
  terminal.sendText("select 1", false);
  terminal.show();

  context.subscriptions.push(output, item, terminal);
};
`
  );
}
