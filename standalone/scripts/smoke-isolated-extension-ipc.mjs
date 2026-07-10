import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const sourceExtensionDir = path.join(standaloneRoot, "extensions", "airdb");
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-isolated-extension-smoke-"));
const extensionsDir = path.join(smokeRoot, "extensions");
const isolatedExtensionDir = path.join(extensionsDir, "airdb");
const storageRoot = path.join(smokeRoot, "storage");
const request = {
  kind: "request",
  id: "smoke-isolated-tree-root",
  group: "tree.resolveChildren",
  payload: { viewId: "activitybar.airdb.sql" }
};

await prepareIsolatedExtension();

const child = spawn(process.execPath, [hostEntry], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    AIRDB_STANDALONE_EXTENSIONS: extensionsDir,
    AIRDB_STANDALONE_STORAGE: storageRoot
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let sentRequest = false;
let resolved = false;
let stderr = "";
let stdoutBuffer = "";

const timeout = setTimeout(() => {
  void fail("Timed out waiting for isolated extension IPC smoke response.");
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).")) {
    sendRequest();
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
      console.error(`Extension host exited before isolated smoke completed. Exit code: ${code}`);
      console.error(`Missing checkpoint(s): ${missingCheckpoints().join(", ")}`);
      if (stderr) {
        console.error(stderr);
      }
      process.exit(1);
    }
  });
});

function sendRequest() {
  if (!sentRequest) {
    child.stdin.write(`${JSON.stringify(request)}\n`);
    sentRequest = true;
  }
}

function handleStdoutLine(line) {
  if (line.includes("Loaded 1 extension(s).")) {
    sendRequest();
    return;
  }
  if (!line.startsWith("{")) {
    return;
  }

  const message = JSON.parse(line);
  if (message.kind === "response" && message.id === request.id) {
    handleTreeResponse(message);
  }
}

function handleTreeResponse(message) {
  if (!message.ok) {
    void fail(message.error ?? "Isolated tree request failed.");
    return;
  }

  const payload = message.payload ?? {};
  if (payload.viewId !== request.payload.viewId || !Array.isArray(payload.nodes)) {
    void fail(`Unexpected isolated tree payload: ${JSON.stringify(payload)}`);
    return;
  }

  resolved = true;
  clearTimeout(timeout);
  console.log(`Resolved isolated ${payload.viewId} with ${payload.nodes.length} root node(s).`);
  child.kill();
}

function missingCheckpoints() {
  return [
    sentRequest ? "" : "tree.resolveChildren",
    resolved ? "" : "tree response"
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

async function prepareIsolatedExtension() {
  await fs.access(hostEntry);
  await fs.access(sourceExtensionDir);
  await fs.mkdir(extensionsDir, { recursive: true });
  await fs.cp(sourceExtensionDir, isolatedExtensionDir, { recursive: true });
  await fs.mkdir(storageRoot, { recursive: true });
}
