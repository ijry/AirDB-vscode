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
  ["smoke:isolated-extension-ipc", ["run", "smoke:isolated-extension-ipc"]],
  ["smoke:dialog-ipc", ["run", "smoke:dialog-ipc"]],
  ["smoke:file-dialog-ipc", ["run", "smoke:file-dialog-ipc"]],
  ["smoke:text-document-ipc", ["run", "smoke:text-document-ipc"]],
  ["smoke:external-actions-ipc", ["run", "smoke:external-actions-ipc"]],
  ["smoke:workbench-feedback-ipc", ["run", "smoke:workbench-feedback-ipc"]],
  ["smoke:workspace-fs-ipc", ["run", "smoke:workspace-fs-ipc"]],
  ["smoke:workspace-metadata-ipc", ["run", "smoke:workspace-metadata-ipc"]],
  ["smoke:notification-ipc", ["run", "smoke:notification-ipc"]],
  ["smoke:webview-ipc", ["run", "smoke:webview-ipc"]],
  ["smoke:extension-diagnostics-ipc", ["run", "smoke:extension-diagnostics-ipc"]],
  ["smoke:vscode-api-compat-ipc", ["run", "smoke:vscode-api-compat-ipc"]]
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
