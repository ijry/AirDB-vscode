import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(standaloneRoot, "..");

function withLegacyOpenSsl(env = process.env) {
  const current = env.NODE_OPTIONS ?? "";
  if (current.includes("--openssl-legacy-provider")) {
    return current;
  }
  return `${current} --openssl-legacy-provider`.trim();
}

function runNode(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: withLegacyOpenSsl(),
      ...extraEnv
    }
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function buildWebviewOnly() {
  const require = createRequire(import.meta.url);
  const webpack = require(path.join(repoRoot, "node_modules", "webpack"));
  const configs = require(path.join(repoRoot, "webpack.config.js"));
  const webviewConfig = configs[1];

  webviewConfig.mode = "production";
  webviewConfig.watch = false;
  webviewConfig.devtool = false;

  await new Promise((resolve, reject) => {
    webpack(webviewConfig, (error, stats) => {
      if (error) {
        reject(error);
        return;
      }

      if (stats?.hasErrors()) {
        reject(new Error(stats.toString({ colors: true, errors: true, warnings: true })));
        return;
      }

      console.log(stats?.toString({ colors: true, warnings: true }) ?? "Webview build complete.");
      resolve(undefined);
    });
  });
}

if (process.env.AIRDB_STANDALONE_BUILD_WEBVIEW === "1") {
  await buildWebviewOnly();
} else {
  runNode(["build.js"]);
  runNode([fileURLToPath(import.meta.url)], { AIRDB_STANDALONE_BUILD_WEBVIEW: "1" });
}
