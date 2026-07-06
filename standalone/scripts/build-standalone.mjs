import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(args, cwd = standaloneRoot) {
  const result = spawnSync("npm", args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(["run", "build"]);
run(["run", "build:airdb"]);
run(["run", "prepare:extensions"]);

for (const resourcePath of [
  "extension-host/dist/main.js",
  "vscode-shim/dist/index.js",
  "protocol/dist/index.js",
  "extensions"
]) {
  const absolutePath = path.join(standaloneRoot, resourcePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Standalone package resource is missing: ${absolutePath}`);
    process.exit(1);
  }
}

run(["run", "tauri", "--workspace", "@airdb-standalone/app", "--", "build"]);
