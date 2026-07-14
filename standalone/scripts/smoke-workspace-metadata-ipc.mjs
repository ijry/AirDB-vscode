import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-workspace-metadata-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "workspace-metadata-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const workspaceRoot = path.join(smokeRoot, "metadata-workspace");
const commandRequest = {
  kind: "request",
  id: "smoke-workspace-metadata-command",
  group: "command.execute",
  payload: { command: "fixture.workspaceMetadata.read" }
};

await prepareFixtureExtension();

const child = spawn("node", [hostEntry], {
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
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for workspace metadata IPC smoke response.");
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
      console.error(`Extension host exited before workspace metadata smoke completed. Exit code: ${code}`);
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
  if (message.kind === "response" && message.id === commandRequest.id) {
    handleCommandResponse(message);
  }
}

function handleCommandResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Workspace metadata command failed.");
    return;
  }

  const payload = message.payload ?? {};
  const expectedStorageRoot = path.join(storageRoot, "fixture.workspace-metadata-fixture");

  if (payload.workspaceName !== path.basename(workspaceRoot)) {
    void fail(`Unexpected workspace name: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.rootPath, workspaceRoot) || !samePath(payload.folderPath, workspaceRoot)) {
    void fail(`Unexpected workspace root payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (payload.folderIndex !== 0 || payload.folderName !== path.basename(workspaceRoot)) {
    void fail(`Unexpected workspace folder payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.absoluteMedia, path.join(extensionDir, "media", "icon.svg"))) {
    void fail(`Unexpected asAbsolutePath payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.storagePath, path.join(expectedStorageRoot, "workspace", workspaceStorageKey(workspaceRoot)))) {
    void fail(`Unexpected storagePath payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.globalStoragePath, path.join(expectedStorageRoot, "global"))) {
    void fail(`Unexpected globalStoragePath payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (!samePath(payload.logPath, path.join(expectedStorageRoot, "logs"))) {
    void fail(`Unexpected logUri payload: ${JSON.stringify(payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved workspace metadata through extension-host command IPC.");
  child.kill();
}

function samePath(actual, expected) {
  return typeof actual === "string" && normalizePath(actual) === normalizePath(path.resolve(expected));
}

function normalizePath(value) {
  return path.resolve(value).replace(/\\/g, "/");
}

function workspaceStorageKey(workspaceRoot) {
  const normalizedWorkspaceRoot = process.platform === "win32"
    ? path.resolve(workspaceRoot).toLowerCase()
    : path.resolve(workspaceRoot);
  return createHash("sha256").update(normalizedWorkspaceRoot).digest("hex");
}

function missingCheckpoints() {
  return [
    sentCommand ? "" : "command.execute",
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
  await fs.mkdir(path.join(extensionDir, "media"), { recursive: true });
  await fs.mkdir(storageRoot, { recursive: true });
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.writeFile(path.join(extensionDir, "media", "icon.svg"), "<svg></svg>\n");
  await fs.writeFile(
    path.join(extensionDir, "package.json"),
    `${JSON.stringify({
      name: "workspace-metadata-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.workspaceMetadata.read",
            title: "Workspace Metadata Read"
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
    vscode.commands.registerCommand("fixture.workspaceMetadata.read", () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      return {
        workspaceName: vscode.workspace.name,
        rootPath: vscode.workspace.rootPath,
        folderIndex: folder?.index,
        folderName: folder?.name,
        folderPath: folder?.uri.fsPath,
        absoluteMedia: context.asAbsolutePath("media/icon.svg"),
        storagePath: context.storagePath,
        globalStoragePath: context.globalStoragePath,
        logPath: context.logUri.fsPath
      };
    })
  );
};
`
  );
}
