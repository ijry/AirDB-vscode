import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultBundleDir = path.join(standaloneRoot, "app", "src-tauri", "target", "release", "bundle", "nsis");
const appRegistryKey = "HKCU:\\Software\\lingyun\\AirDB Standalone";
const uninstallRegistryKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AirDB Standalone";

if (process.platform !== "win32") {
  console.error("NSIS installer smoke is only supported on Windows.");
  process.exit(1);
}

const installer = await resolveInstaller();
const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-standalone-nsis-smoke-"));

try {
  await assertNoExistingInstall();
  await installNsis(installer, smokeRoot);
  await assertInstalledLayout(smokeRoot);
  await smokeLaunchInstalledApp(smokeRoot);
  await uninstallNsis(smokeRoot);
  await removeKnownSmokeRegistryResidue(smokeRoot);
  await assertNoResidue(smokeRoot);
  console.log("NSIS installer smoke passed.");
} catch (error) {
  await bestEffortCleanup(smokeRoot);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

async function resolveInstaller() {
  if (process.env.AIRDB_STANDALONE_NSIS_INSTALLER) {
    const explicitInstaller = path.resolve(process.env.AIRDB_STANDALONE_NSIS_INSTALLER);
    await fs.access(explicitInstaller);
    return explicitInstaller;
  }

  const entries = await fs.readdir(defaultBundleDir, { withFileTypes: true });
  const installers = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith("-setup.exe")) {
      const installerPath = path.join(defaultBundleDir, entry.name);
      const stat = await fs.stat(installerPath);
      installers.push({ path: installerPath, mtimeMs: stat.mtimeMs });
    }
  }

  if (installers.length === 0) {
    throw new Error(`No NSIS setup executable found in ${defaultBundleDir}. Run npm run package first.`);
  }

  installers.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return installers[0].path;
}

async function assertNoExistingInstall() {
  const existingKeys = [];
  for (const key of [uninstallRegistryKey, appRegistryKey]) {
    if (await registryKeyExists(key)) {
      existingKeys.push(key);
    }
  }

  if (existingKeys.length > 0) {
    throw new Error(`Refusing to run NSIS smoke because an AirDB Standalone install registry key already exists: ${existingKeys.join(", ")}`);
  }
}

async function installNsis(installerPath, installDir) {
  console.log(`Installing ${installerPath} into ${installDir}`);
  const result = await run(installerPath, ["/S", `/D=${installDir}`], { timeoutMs: 120_000 });
  if (result.code !== 0) {
    throw new Error(`NSIS installer failed with exit code ${result.code ?? "(none)"}.\n${result.stderr}`);
  }
  await waitForPath(path.join(installDir, "airdb-standalone.exe"), 30_000);
}

async function assertInstalledLayout(installDir) {
  const requiredPaths = [
    "airdb-standalone.exe",
    "uninstall.exe",
    path.join("extensions", "airdb", "package.json"),
    path.join("runtime", "node", "windows-x64", "node.exe"),
    path.join("extension-host", "dist", "main.js"),
    path.join("vscode-shim", "dist", "index.js")
  ];

  for (const relativePath of requiredPaths) {
    await fs.access(path.join(installDir, relativePath));
  }

  const extensionsDir = path.join(installDir, "extensions");
  const entries = await fs.readdir(extensionsDir, { withFileTypes: true });
  const extensionNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (extensionNames.length !== 1 || extensionNames[0] !== "airdb") {
    throw new Error(`Unexpected installed extension set: ${extensionNames.join(", ") || "(none)"}`);
  }

  const manifest = JSON.parse(await fs.readFile(path.join(extensionsDir, "airdb", "package.json"), "utf8"));
  if (manifest.name !== "airdb" || manifest.publisher !== "jry") {
    throw new Error(`Unexpected installed AirDB extension identity: ${manifest.publisher}.${manifest.name}`);
  }

  const nodeVersion = await run(path.join(installDir, "runtime", "node", "windows-x64", "node.exe"), ["--version"], { timeoutMs: 10_000 });
  if (nodeVersion.code !== 0) {
    throw new Error(`Packaged Node runtime failed: ${nodeVersion.stderr}`);
  }

  console.log(`Installed layout verified with ${extensionNames[0]} extension and Node ${nodeVersion.stdout.trim()}.`);
}

async function smokeLaunchInstalledApp(installDir) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$exe = Join-Path $env:AIRDB_STANDALONE_NSIS_SMOKE_INSTALL_DIR 'airdb-standalone.exe'
$proc = Start-Process -FilePath $exe -WorkingDirectory $env:AIRDB_STANDALONE_NSIS_SMOKE_INSTALL_DIR -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 8
$proc.Refresh()
Write-Output "APP_PID=$($proc.Id)"
Write-Output "APP_EXITED=$($proc.HasExited)"
if ($proc.HasExited) {
  throw "Installed app exited before smoke window with code $($proc.ExitCode)"
}
$closed = $proc.CloseMainWindow()
Write-Output "APP_CLOSE_MAIN_WINDOW=$closed"
Start-Sleep -Seconds 2
$proc.Refresh()
if (-not $proc.HasExited) {
  Stop-Process -Id $proc.Id -Force
  Write-Output "APP_FORCE_KILLED=true"
} else {
  Write-Output "APP_FORCE_KILLED=false"
}
`;

  const result = await runPowerShell(script, {
    AIRDB_STANDALONE_NSIS_SMOKE_INSTALL_DIR: installDir
  }, 30_000);

  if (result.code !== 0) {
    throw new Error(`Installed app smoke failed.\n${result.stdout}\n${result.stderr}`);
  }

  process.stdout.write(result.stdout);
}

async function uninstallNsis(installDir) {
  const uninstaller = path.join(installDir, "uninstall.exe");
  await fs.access(uninstaller);
  console.log("Uninstalling smoke installation.");
  const result = await run(uninstaller, ["/S"], { timeoutMs: 120_000 });
  if (result.code !== 0) {
    throw new Error(`NSIS uninstaller failed with exit code ${result.code ?? "(none)"}.\n${result.stderr}`);
  }
  await waitForPathRemoval(installDir, 30_000);
}

async function removeKnownSmokeRegistryResidue(installDir) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$key = 'HKCU:\Software\lingyun\AirDB Standalone'
if (Test-Path $key) {
  $item = Get-Item -LiteralPath $key
  $valueNames = @($item.GetValueNames())
  $isSmokeResidue = $item.SubKeyCount -eq 0 -and $valueNames.Count -eq 1 -and $item.GetValue($valueNames[0]) -eq $env:AIRDB_STANDALONE_NSIS_SMOKE_INSTALL_DIR
  if (-not $isSmokeResidue) {
    throw "Refusing to remove unexpected registry key shape: $key"
  }
  Remove-Item -LiteralPath $key -Force
  Write-Output "Removed smoke-created application registry key residue."
}
`;

  const result = await runPowerShell(script, {
    AIRDB_STANDALONE_NSIS_SMOKE_INSTALL_DIR: installDir
  }, 10_000);

  if (result.code !== 0) {
    throw new Error(`Failed to clean smoke registry residue.\n${result.stdout}\n${result.stderr}`);
  }
  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
  }
}

async function assertNoResidue(installDir) {
  if (await pathExists(installDir)) {
    throw new Error(`Smoke install directory still exists after uninstall: ${installDir}`);
  }

  const remainingKeys = [];
  for (const key of [uninstallRegistryKey, appRegistryKey]) {
    if (await registryKeyExists(key)) {
      remainingKeys.push(key);
    }
  }
  if (remainingKeys.length > 0) {
    throw new Error(`Smoke registry residue remains: ${remainingKeys.join(", ")}`);
  }

  const processCheck = await runPowerShell("(Get-Process -Name 'airdb-standalone' -ErrorAction SilentlyContinue | Measure-Object).Count", {}, 10_000);
  if (processCheck.code !== 0 || processCheck.stdout.trim() !== "0") {
    throw new Error(`airdb-standalone process residue remains.\n${processCheck.stdout}\n${processCheck.stderr}`);
  }
}

async function bestEffortCleanup(installDir) {
  try {
    const uninstaller = path.join(installDir, "uninstall.exe");
    if (await pathExists(uninstaller)) {
      await run(uninstaller, ["/S"], { timeoutMs: 60_000 });
    }
  } catch {
    // Keep cleanup best-effort so the original smoke failure remains visible.
  }

  try {
    await fs.rm(installDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup.
  }

  try {
    await removeKnownSmokeRegistryResidue(installDir);
  } catch {
    // Best-effort cleanup.
  }
}

async function registryKeyExists(key) {
  const script = `if (Test-Path '${key.replace(/'/g, "''")}') { exit 0 } else { exit 1 }`;
  const result = await runPowerShell(script, {}, 10_000);
  return result.code === 0;
}

async function waitForPath(targetPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pathExists(targetPath)) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for path: ${targetPath}`);
}

async function waitForPathRemoval(targetPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await pathExists(targetPath))) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for path removal: ${targetPath}`);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runPowerShell(script, env = {}, timeoutMs = 30_000) {
  return run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    env,
    timeoutMs
  });
}

function run(command, args, { env = {}, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
}
