import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-diagnostics-smoke-"));
const extensionsDir = path.join(tempRoot, "extensions");
const storageRoot = path.join(tempRoot, ".data");
const extensionPath = path.join(extensionsDir, "fixture");

await fs.mkdir(extensionPath, { recursive: true });
await fs.writeFile(path.join(extensionPath, "package.json"), JSON.stringify({
  name: "diagnostic-fixture",
  publisher: "airdb",
  version: "1.0.0",
  main: "./extension.js",
  activationEvents: ["onStartupFinished"],
  contributes: {
    commands: [{ command: "diagnostic-fixture.ping", title: "Ping" }],
    views: { explorer: [{ id: "diagnostic.fixture", name: "Diagnostic Fixture" }] }
  }
}));
await fs.writeFile(
  path.join(extensionPath, "extension.js"),
  [
    "const vscode = require(\"vscode\");",
    "exports.activate = function activate() {",
    "  try {",
    "    void vscode.tasks.fetchTasks;",
    "  } catch {",
    "    // Expected: this smoke verifies unsupported API diagnostics without failing activation.",
    "  }",
    "  return { ok: true };",
    "};",
    ""
  ].join("\n")
);

const child = spawn("node", [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot,
    AIRDB_STANDALONE_WORKSPACE: tempRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sawDiagnostics = false;
let sawActivated = false;
let sawUnsupportedApi = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  child.kill();
  console.error("Timed out waiting for extension diagnostics smoke response.");
  console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
}, 15000);

function missingCheckpoints() {
  return [
    sawDiagnostics ? "" : "extension.diagnostics activated snapshot",
    sawActivated ? "" : "extension.activated",
    sawUnsupportedApi ? "" : "extension.diagnostics unsupportedApi event"
  ].filter(Boolean);
}

function finishIfReady() {
  if (sawDiagnostics && sawActivated && sawUnsupportedApi) {
    clearTimeout(timeout);
    console.log("Received extension diagnostics, unsupported API event, and activation notifications.");
    child.kill();
  }
}

function handleStdoutLine(line) {
  if (!line || !line.startsWith("{")) {
    return;
  }

  const message = JSON.parse(line);
  if (message.kind === "notification" && message.group === "extension.diagnostics") {
    const extension = message.payload?.extensions?.find((item) => item.id === "airdb.diagnostic-fixture");
    if (
      extension &&
      extension.status === "activated" &&
      extension.commandCount === 1 &&
      extension.contributedViews?.includes("diagnostic.fixture")
    ) {
      sawDiagnostics = true;
    }
    if (
      extension?.events?.some((event) =>
        event.phase === "unsupportedApi" &&
        event.details?.api === "tasks.fetchTasks" &&
        event.details?.code === "AIRDB_STANDALONE_UNSUPPORTED_VSCODE_API"
      )
    ) {
      sawUnsupportedApi = true;
    }
  }
  if (
    message.kind === "notification" &&
    message.group === "extension.activated" &&
    message.payload?.loaded?.includes("airdb.diagnostic-fixture")
  ) {
    sawActivated = true;
  }
  finishIfReady();
}

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString();
  let lineEnd = stdoutBuffer.indexOf("\n");
  while (lineEnd >= 0) {
    const line = stdoutBuffer.slice(0, lineEnd).trim();
    stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
    handleStdoutLine(line);
    lineEnd = stdoutBuffer.indexOf("\n");
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!sawDiagnostics || !sawActivated || !sawUnsupportedApi) {
    console.error(`Extension host exited before diagnostics smoke completed. Exit code: ${code}`);
    console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
    if (stderr) {
      console.error(stderr);
    }
    process.exit(1);
  }
});
