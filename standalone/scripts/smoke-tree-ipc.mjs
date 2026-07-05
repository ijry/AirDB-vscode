import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostEntry = path.join(standaloneRoot, "extension-host", "dist", "main.js");
const extensionsDir = path.join(standaloneRoot, "extensions");
const storageRoot = path.join(standaloneRoot, ".data");
const request = {
  kind: "request",
  id: "smoke-tree-root",
  group: "tree.resolveChildren",
  payload: { viewId: "activitybar.airdb.sql" }
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

let sent = false;
let resolved = false;
let stderr = "";

const timeout = setTimeout(() => {
  child.kill();
  console.error("Timed out waiting for tree IPC smoke response.");
  if (stderr) {
    console.error(stderr);
  }
  process.exit(1);
}, 15000);

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  if (stderr.includes("Loaded 1 extension(s).") && !sent) {
    child.stdin.write(`${JSON.stringify(request)}\n`);
    sent = true;
  }
});

child.stdout.on("data", (chunk) => {
  for (const rawLine of chunk.toString().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.includes("Loaded 1 extension(s).") && !sent) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
      sent = true;
      continue;
    }
    if (!line.startsWith("{")) {
      continue;
    }

    const message = JSON.parse(line);
    if (message.kind === "response" && message.id === request.id) {
      clearTimeout(timeout);
      resolved = true;
      if (!message.ok) {
        console.error(message.error);
        child.kill();
        process.exit(1);
      }
      console.log(`Resolved ${message.payload.viewId} with ${message.payload.nodes.length} root node(s).`);
      child.kill();
      return;
    }
  }
});

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!resolved) {
    console.error(`Extension host exited before smoke response. Exit code: ${code}`);
    if (stderr) {
      console.error(stderr);
    }
    process.exit(1);
  }
});
