import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function platformNodeRuntimeDirName(platform = process.platform, arch = process.arch) {
  const normalizedArch = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : arch;
  if (platform === "win32") {
    return `windows-${normalizedArch}`;
  }
  if (platform === "darwin") {
    return `darwin-${normalizedArch}`;
  }
  if (platform === "linux") {
    return `linux-${normalizedArch}`;
  }
  return `${platform}-${normalizedArch}`;
}

export function nodeExecutableName(platform = process.platform) {
  return platform === "win32" ? "node.exe" : "node";
}

export function resolveNodeRuntimeSource({
  standaloneRoot,
  env = process.env,
  platform = process.platform,
  arch = process.arch
}) {
  const platformDir = platformNodeRuntimeDirName(platform, arch);
  const executableName = nodeExecutableName(platform);
  const checkedPaths = [];
  const envRuntime = env.AIRDB_STANDALONE_NODE_RUNTIME?.trim();

  if (envRuntime) {
    const sourcePath = resolveExecutableFromInput(
      path.resolve(standaloneRoot, envRuntime),
      platformDir,
      executableName,
      checkedPaths
    );
    if (sourcePath) {
      return { sourcePath, platformDir, executableName, sourceKind: "env", checkedPaths };
    }

    throw new Error(
      [
        "AIRDB_STANDALONE_NODE_RUNTIME did not resolve to a Node executable.",
        `Checked: ${checkedPaths.join(", ")}`
      ].join(" ")
    );
  }

  const stagedPath = path.join(standaloneRoot, "runtime", "node", platformDir, executableName);
  checkedPaths.push(stagedPath);
  if (isExecutableFile(stagedPath)) {
    return { sourcePath: stagedPath, platformDir, executableName, sourceKind: "staged", checkedPaths };
  }

  throw new Error(
    [
      "Node runtime sidecar is required for packaging.",
      "Set AIRDB_STANDALONE_NODE_RUNTIME to a Node executable or stage one at",
      path.relative(standaloneRoot, stagedPath).replace(/\\/g, "/"),
      "before running npm run package."
    ].join(" ")
  );
}

export function ensureNodeRuntimeStaged(options) {
  const resolved = resolveNodeRuntimeSource(options);
  const targetPath = path.join(
    options.standaloneRoot,
    "runtime",
    "node",
    resolved.platformDir,
    resolved.executableName
  );

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (path.resolve(resolved.sourcePath) !== path.resolve(targetPath)) {
    fs.copyFileSync(resolved.sourcePath, targetPath);
  }
  fs.chmodSync(targetPath, 0o755);
  return targetPath;
}

export function validateNodeRuntime(executablePath, spawn = spawnSync) {
  const result = spawn(executablePath, ["--version"], {
    encoding: "utf8"
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  if (result.status !== 0) {
    throw new Error(`Packaged Node runtime validation failed for ${executablePath}: ${output}`);
  }
  if (!/^v\d+\./.test(output)) {
    throw new Error(`Packaged Node runtime returned an unexpected version string: ${output}`);
  }

  return output;
}

function resolveExecutableFromInput(inputPath, platformDir, executableName, checkedPaths) {
  checkedPaths.push(inputPath);
  if (isExecutableFile(inputPath)) {
    return inputPath;
  }

  const directExecutable = path.join(inputPath, executableName);
  checkedPaths.push(directExecutable);
  if (isExecutableFile(directExecutable)) {
    return directExecutable;
  }

  const platformExecutable = path.join(inputPath, platformDir, executableName);
  checkedPaths.push(platformExecutable);
  if (isExecutableFile(platformExecutable)) {
    return platformExecutable;
  }

  return undefined;
}

function isExecutableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
