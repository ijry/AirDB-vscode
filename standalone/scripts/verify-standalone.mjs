import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const steps = [
  ["check:workspace", ["run", "check:workspace"]],
  ["typecheck", ["run", "typecheck"]],
  ["build", ["run", "build"]],
  ["build:airdb", ["run", "build:airdb"]],
  ["prepare:extensions", ["run", "prepare:extensions"]],
  ["check:prepared-extensions", ["run", "check:prepared-extensions"]],
  ["test", ["run", "test"]],
  ["smoke:tree-ipc", ["run", "smoke:tree-ipc"]],
  ["smoke:webview-ipc", ["run", "smoke:webview-ipc"]],
  ["smoke:isolated-extension-ipc", ["run", "smoke:isolated-extension-ipc"]]
];

for (const [label, args] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync("npm", args, {
    cwd: standaloneRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nStandalone verification passed.");
