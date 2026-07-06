import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-workspace-fs-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const extensionDir = path.join(extensionsDir, "workspace-fs-fixture");
const storageRoot = path.join(smokeRoot, "storage");
const commandRequest = {
  kind: "request",
  id: "smoke-workspace-fs-command",
  group: "command.execute",
  payload: { command: "fixture.workspaceFs.run" }
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
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for workspace.fs IPC smoke response.");
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
      console.error(`Extension host exited before workspace.fs smoke completed. Exit code: ${code}`);
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
    void fail(message.error ?? "workspace.fs command failed.");
    return;
  }

  const payload = message.payload ?? {};
  if (payload.text !== "select 1") {
    void fail(`Unexpected read text: ${JSON.stringify(payload)}`);
    return;
  }
  if (payload.fileType !== payload.fileTypeFile || payload.directoryType !== payload.fileTypeDirectory) {
    void fail(`Unexpected file type payload: ${JSON.stringify(payload)}`);
    return;
  }
  if (payload.size !== 8) {
    void fail(`Unexpected file size: ${JSON.stringify(payload)}`);
    return;
  }
  if (!payload.deleted) {
    void fail(`workspace.fs.delete did not remove the smoke directory: ${JSON.stringify(payload)}`);
    return;
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const sawFile = entries.some((entry) => entry[0] === "query.sql" && entry[1] === payload.fileTypeFile);
  const sawDirectory = entries.some((entry) => entry[0] === "child" && entry[1] === payload.fileTypeDirectory);
  if (!sawFile || !sawDirectory) {
    void fail(`workspace.fs.readDirectory missed expected entries: ${JSON.stringify(payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log("Resolved workspace.fs operations through extension-host command IPC.");
  child.kill();
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
  await fs.mkdir(storageRoot, { recursive: true });
  await fs.writeFile(
    path.join(extensionDir, "package.json"),
    `${JSON.stringify({
      name: "workspace-fs-fixture",
      publisher: "fixture",
      version: "0.0.1",
      main: "./out/extension.js",
      activationEvents: ["*"],
      contributes: {
        commands: [
          {
            command: "fixture.workspaceFs.run",
            title: "Workspace FS Run"
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
    vscode.commands.registerCommand("fixture.workspaceFs.run", async () => {
      const root = vscode.Uri.file(\`\${context.globalStorageUri.fsPath}/workspace-fs-smoke\`);
      const nested = vscode.Uri.file(\`\${root.fsPath}/nested\`);
      const child = vscode.Uri.file(\`\${nested.fsPath}/child\`);
      const sql = vscode.Uri.file(\`\${nested.fsPath}/query.sql\`);

      await vscode.workspace.fs.createDirectory(child);
      await vscode.workspace.fs.writeFile(sql, Buffer.from("select 1", "utf8"));

      const bytes = await vscode.workspace.fs.readFile(sql);
      const fileStat = await vscode.workspace.fs.stat(sql);
      const directoryStat = await vscode.workspace.fs.stat(child);
      const entries = await vscode.workspace.fs.readDirectory(nested);

      await vscode.workspace.fs.delete(root, { recursive: true, useTrash: true });

      let deleted = false;
      try {
        await vscode.workspace.fs.stat(root);
      } catch (error) {
        deleted = error?.code === "FileNotFound";
      }

      return {
        text: Buffer.from(bytes).toString("utf8"),
        fileType: fileStat.type,
        directoryType: directoryStat.type,
        size: fileStat.size,
        entries,
        deleted,
        fileTypeFile: vscode.FileType.File,
        fileTypeDirectory: vscode.FileType.Directory
      };
    })
  );
};
`
  );
}
