# Node Runtime Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make packaged AirDB Standalone installers run the Node-based extension host without requiring `node` on the user's `PATH`.

**Architecture:** Keep the Node extension-host architecture unchanged, but add a deterministic sidecar runtime staging path under `standalone/runtime/node/<platform>/`. The package script validates and stages a caller-provided Node executable, Tauri bundles that resource directory, and the Rust backend resolves Node in the order `AIRDB_STANDALONE_NODE`, packaged sidecar, then system `node` for development fallback.

**Tech Stack:** Tauri 2, Rust `std::process::Command`, Node.js ESM build scripts, Node `node:test`, PowerShell verification commands.

## Global Constraints

- Packaged AirDB Standalone installers must run the Node-based extension host without requiring `node` on the user's `PATH`.
- The build must not download Node implicitly.
- The packaging step must consume a caller-provided Node runtime path or a checked-in/local runtime staging path.
- Runtime resolution order must be `AIRDB_STANDALONE_NODE`, packaged sidecar runtime, then `node` on `PATH` as a development fallback.
- Packaged resource layout must use `runtime/node/windows-x64/node.exe` for the current Windows packaging path.
- `AIRDB_STANDALONE_NODE_RUNTIME` must accept an absolute or relative path to a Node executable or a directory containing the executable for the current platform.
- `standalone/runtime/node/<platform>/node.exe` is an optional local staging path for developers or CI.
- `standalone/app/src-tauri/tauri.conf.json` must bundle `"../../runtime/node": "runtime/node"`.
- Existing extension-host resources and packaged `node_modules` layout remain unchanged.
- Do not rewrite the extension host in Rust.
- Do not embed a JavaScript engine into the Tauri backend.
- Do not implement automatic Node downloads in this change.
- Do not bundle npm, headers, or a full Node distribution.
- Do not remove the development fallback to system `node`.

---

## File Structure

- Create `standalone/scripts/node-runtime.mjs`: pure build-script helpers for platform naming, executable discovery, sidecar staging, and `node --version` validation.
- Create `standalone/scripts/node-runtime.test.mjs`: Node `node:test` coverage for sidecar discovery and staging behavior.
- Modify `standalone/package.json`: add `test:scripts` and include it in the root `test` command.
- Modify `standalone/.gitignore`: keep `standalone/runtime/node/.gitkeep` tracked and ignore staged Node binaries.
- Create `standalone/runtime/node/.gitkeep`: keeps the Tauri resource root present without committing binaries.
- Modify `standalone/scripts/build-standalone.mjs`: stage and validate the Node runtime before invoking Tauri build.
- Modify `standalone/app/src-tauri/src/main.rs`: resolve Node runtime from env override, sidecar, or PATH fallback, and use it for `Command::new`.
- Modify `standalone/app/src-tauri/tauri.conf.json`: bundle `runtime/node` as a Tauri resource.
- Modify `standalone/README.md`: document development fallback, packaging input, and CI/local staging behavior.

---

### Task 1: Add Node Runtime Staging Helpers And Script Tests

**Files:**
- Create: `standalone/scripts/node-runtime.mjs`
- Create: `standalone/scripts/node-runtime.test.mjs`
- Modify: `standalone/package.json`
- Modify: `standalone/.gitignore`
- Create: `standalone/runtime/node/.gitkeep`

**Interfaces:**
- Produces: `platformNodeRuntimeDirName(platform?: string, arch?: string): string`
- Produces: `nodeExecutableName(platform?: string): string`
- Produces: `resolveNodeRuntimeSource(options): { sourcePath: string; platformDir: string; executableName: string; sourceKind: "env" | "staged"; checkedPaths: string[] }`
- Produces: `ensureNodeRuntimeStaged(options): string`
- Produces: `validateNodeRuntime(executablePath: string, spawn?: typeof spawnSync): string`
- Consumes later: `build-standalone.mjs` imports `ensureNodeRuntimeStaged`, `validateNodeRuntime`, `platformNodeRuntimeDirName`, and `nodeExecutableName`.

- [ ] **Step 1: Create the runtime staging directory placeholder**

Create `standalone/runtime/node/.gitkeep` as an empty file.

- [ ] **Step 2: Update ignore rules for local Node binaries**

In `standalone/.gitignore`, add these lines after the `.packaged-resources` rules:

```gitignore
runtime/node/*
!runtime/node/.gitkeep
```

Expected result: `standalone/runtime/node/.gitkeep` is tracked, but `standalone/runtime/node/windows-x64/node.exe` is ignored.

- [ ] **Step 3: Create failing script tests**

Create `standalone/scripts/node-runtime.test.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  ensureNodeRuntimeStaged,
  nodeExecutableName,
  platformNodeRuntimeDirName,
  resolveNodeRuntimeSource,
  validateNodeRuntime
} from "./node-runtime.mjs";

const tempRoots = [];

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "airdb-node-runtime-test-"));
  tempRoots.push(root);
  return root;
}

function writeExecutable(filePath, content = "fake node") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("node runtime packaging helpers", () => {
  it("maps platform and architecture to packaged runtime names", () => {
    assert.equal(platformNodeRuntimeDirName("win32", "x64"), "windows-x64");
    assert.equal(platformNodeRuntimeDirName("darwin", "arm64"), "darwin-arm64");
    assert.equal(platformNodeRuntimeDirName("linux", "x64"), "linux-x64");
    assert.equal(nodeExecutableName("win32"), "node.exe");
    assert.equal(nodeExecutableName("linux"), "node");
  });

  it("resolves AIRDB_STANDALONE_NODE_RUNTIME when it points to an executable", () => {
    const root = tempRoot();
    const executable = path.join(root, "custom-node.exe");
    writeExecutable(executable);

    const resolved = resolveNodeRuntimeSource({
      standaloneRoot: root,
      env: { AIRDB_STANDALONE_NODE_RUNTIME: executable },
      platform: "win32",
      arch: "x64"
    });

    assert.equal(resolved.sourcePath, executable);
    assert.equal(resolved.platformDir, "windows-x64");
    assert.equal(resolved.executableName, "node.exe");
    assert.equal(resolved.sourceKind, "env");
  });

  it("resolves AIRDB_STANDALONE_NODE_RUNTIME when it points to a platform directory", () => {
    const root = tempRoot();
    const runtimeRoot = path.join(root, "node-runtime");
    const executable = path.join(runtimeRoot, "windows-x64", "node.exe");
    writeExecutable(executable);

    const resolved = resolveNodeRuntimeSource({
      standaloneRoot: root,
      env: { AIRDB_STANDALONE_NODE_RUNTIME: runtimeRoot },
      platform: "win32",
      arch: "x64"
    });

    assert.equal(resolved.sourcePath, executable);
    assert.equal(resolved.sourceKind, "env");
  });

  it("resolves a staged runtime when no environment override is provided", () => {
    const root = tempRoot();
    const executable = path.join(root, "runtime", "node", "windows-x64", "node.exe");
    writeExecutable(executable);

    const resolved = resolveNodeRuntimeSource({
      standaloneRoot: root,
      env: {},
      platform: "win32",
      arch: "x64"
    });

    assert.equal(resolved.sourcePath, executable);
    assert.equal(resolved.sourceKind, "staged");
  });

  it("copies an environment-provided runtime into the staged resource layout", () => {
    const root = tempRoot();
    const source = path.join(root, "downloaded", "node.exe");
    writeExecutable(source, "runtime bytes");

    const staged = ensureNodeRuntimeStaged({
      standaloneRoot: root,
      env: { AIRDB_STANDALONE_NODE_RUNTIME: source },
      platform: "win32",
      arch: "x64"
    });

    assert.equal(staged, path.join(root, "runtime", "node", "windows-x64", "node.exe"));
    assert.equal(fs.readFileSync(staged, "utf8"), "runtime bytes");
  });

  it("throws a clear error when no package runtime source exists", () => {
    const root = tempRoot();

    assert.throws(
      () =>
        resolveNodeRuntimeSource({
          standaloneRoot: root,
          env: {},
          platform: "win32",
          arch: "x64"
        }),
      /AIRDB_STANDALONE_NODE_RUNTIME/
    );
  });

  it("validates a real Node executable with --version", () => {
    const version = validateNodeRuntime(process.execPath);

    assert.match(version, /^v\d+\./);
  });
});
```

- [ ] **Step 4: Register script tests in the root standalone package**

In `standalone/package.json`, replace the root test script:

```json
"test": "npm run test --workspaces --if-present",
```

with:

```json
"test": "npm run test:scripts && npm run test --workspaces --if-present",
"test:scripts": "node scripts/node-runtime.test.mjs",
"typecheck": "npm run typecheck --workspaces --if-present",
```

Keep the existing workspace scripts unchanged.

- [ ] **Step 5: Run the new script test and verify it fails**

Run:

```powershell
npm --prefix standalone run test:scripts
```

Expected: FAIL with an import/module-not-found error because `standalone/scripts/node-runtime.mjs` does not exist yet.

- [ ] **Step 6: Implement `node-runtime.mjs`**

Create `standalone/scripts/node-runtime.mjs`:

```js
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
```

- [ ] **Step 7: Run script tests and full standalone root tests**

Run:

```powershell
npm --prefix standalone run test:scripts
npm --prefix standalone run test
```

Expected: PASS. `npm --prefix standalone run test` must run the new script test first and then all workspace tests.

- [ ] **Step 8: Commit Task 1**

Run:

```powershell
git add standalone/.gitignore standalone/package.json standalone/runtime/node/.gitkeep standalone/scripts/node-runtime.mjs standalone/scripts/node-runtime.test.mjs
git commit -m "test: add node runtime staging helpers"
```

---

### Task 2: Use The Sidecar Runtime In The Rust Extension Host Launcher

**Files:**
- Modify: `standalone/app/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `runtime/node/<platform>/<node executable>` resource layout from Task 1.
- Produces: `resolve_node_runtime_from_candidates(env_node: Option<PathBuf>, root_candidates: &[PathBuf], allow_path_fallback: bool) -> Result<PathBuf, String>`.
- Produces: `node_runtime_relative_path() -> PathBuf`.
- Produces: `current_node_runtime_platform_dir() -> &'static str`.
- Produces: `node_executable_name() -> &'static str`.
- Produces: `spawn_extension_host` starts `Command::new(&node_runtime)` instead of `Command::new("node")`.

- [ ] **Step 1: Add failing Rust tests for Node runtime resolution**

In `standalone/app/src-tauri/src/main.rs`, inside the existing `#[cfg(test)] mod tests`, add this helper after `create_host_entry`:

```rust
    fn create_node_runtime(root: &std::path::Path) -> PathBuf {
        let runtime_path = root.join(node_runtime_relative_path());
        fs::create_dir_all(runtime_path.parent().unwrap()).unwrap();
        fs::write(&runtime_path, "node").unwrap();
        runtime_path
    }
```

Add these tests after `extension_host_storage_uses_app_data_dir`:

```rust
    #[test]
    fn node_runtime_resolution_uses_env_override_first() {
        let env_node = PathBuf::from("C:/custom/node.exe");
        let resource_root = temp_root();
        let sidecar = create_node_runtime(&resource_root);

        let resolved = resolve_node_runtime_from_candidates(
            Some(env_node.clone()),
            &[resource_root.clone()],
            true,
        )
        .unwrap();

        assert_eq!(resolved, env_node);
        assert!(sidecar.exists());
        fs::remove_dir_all(resource_root).unwrap();
    }

    #[test]
    fn node_runtime_resolution_prefers_sidecar_before_path_fallback() {
        let resource_root = temp_root();
        let sidecar = create_node_runtime(&resource_root);

        let resolved =
            resolve_node_runtime_from_candidates(None, &[resource_root.clone()], true).unwrap();

        assert_eq!(resolved, sidecar);
        fs::remove_dir_all(resource_root).unwrap();
    }

    #[test]
    fn node_runtime_resolution_falls_back_to_system_node_for_development() {
        let resource_root = temp_root();

        let resolved =
            resolve_node_runtime_from_candidates(None, &[resource_root.clone()], true).unwrap();

        assert_eq!(resolved, PathBuf::from("node"));
        fs::remove_dir_all(resource_root).unwrap();
    }

    #[test]
    fn node_runtime_resolution_errors_when_no_runtime_and_no_fallback() {
        let resource_root = temp_root();

        let error =
            resolve_node_runtime_from_candidates(None, &[resource_root.clone()], false).unwrap_err();

        assert!(error.contains("AIRDB_STANDALONE_NODE"));
        assert!(error.contains("runtime/node"));
        fs::remove_dir_all(resource_root).unwrap();
    }
```

- [ ] **Step 2: Run Rust tests and verify failure**

Run:

```powershell
cargo test --manifest-path standalone/app/src-tauri/Cargo.toml node_runtime_resolution
```

Expected: FAIL because `node_runtime_relative_path` and `resolve_node_runtime_from_candidates` are not defined.

- [ ] **Step 3: Add Node runtime helper functions**

In `standalone/app/src-tauri/src/main.rs`, add this block after `prepare_extension_host_storage_root`:

```rust
fn resolve_node_runtime(standalone_root: &Path) -> Result<PathBuf, String> {
    let env_node = std::env::var("AIRDB_STANDALONE_NODE")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    resolve_node_runtime_from_candidates(env_node, &[standalone_root.to_path_buf()], true)
}

fn resolve_node_runtime_from_candidates(
    env_node: Option<PathBuf>,
    root_candidates: &[PathBuf],
    allow_path_fallback: bool,
) -> Result<PathBuf, String> {
    if let Some(node) = env_node {
        return Ok(node);
    }

    let relative_path = node_runtime_relative_path();
    if let Some(node) = root_candidates
        .iter()
        .map(|root| root.join(&relative_path))
        .find(|candidate| candidate.exists())
    {
        return Ok(node);
    }

    if allow_path_fallback {
        return Ok(PathBuf::from("node"));
    }

    Err(format!(
        "Unable to resolve Node runtime. Set AIRDB_STANDALONE_NODE, include the packaged sidecar at {}, or install node on PATH for development.",
        relative_path.display()
    ))
}

fn node_runtime_relative_path() -> PathBuf {
    PathBuf::from("runtime")
        .join("node")
        .join(current_node_runtime_platform_dir())
        .join(node_executable_name())
}

fn current_node_runtime_platform_dir() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        ("macos", "x86_64") => "darwin-x64",
        ("macos", "aarch64") => "darwin-arm64",
        ("linux", "x86_64") => "linux-x64",
        ("linux", "aarch64") => "linux-arm64",
        _ => "unsupported",
    }
}

fn node_executable_name() -> &'static str {
    if std::env::consts::OS == "windows" {
        "node.exe"
    } else {
        "node"
    }
}
```

- [ ] **Step 4: Update `spawn_extension_host` to use the resolved runtime**

In `spawn_extension_host`, after `let standalone_root = resolve_standalone_root(&app)?;`, add:

```rust
    let node_runtime = resolve_node_runtime(&standalone_root)?;
```

Replace:

```rust
    let mut child = Command::new("node")
```

with:

```rust
    let mut child = Command::new(&node_runtime)
```

Replace the `ErrorKind::NotFound` message inside `map_err` with:

```rust
                format!(
                    "Failed to start extension host because the Node runtime was not found. Tried: {}. Set AIRDB_STANDALONE_NODE, include the packaged Node sidecar, or install node on PATH for development. Extension host entry: {}",
                    node_runtime.display(),
                    host_entry.display()
                )
```

Keep the non-`NotFound` error branch unchanged except that it should still include `host_entry.display()`.

- [ ] **Step 5: Run Rust tests**

Run:

```powershell
cargo test --manifest-path standalone/app/src-tauri/Cargo.toml node_runtime_resolution
cargo test --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: PASS. The full Rust test suite should include the existing webview/root/storage tests plus the new Node runtime tests.

- [ ] **Step 6: Run Rust format and check**

Run:

```powershell
cargo fmt --manifest-path standalone/app/src-tauri/Cargo.toml
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git add standalone/app/src-tauri/src/main.rs
git commit -m "feat: resolve packaged node runtime"
```

---

### Task 3: Bundle The Runtime Resource And Document Packaging

**Files:**
- Modify: `standalone/scripts/build-standalone.mjs`
- Modify: `standalone/app/src-tauri/tauri.conf.json`
- Modify: `standalone/README.md`

**Interfaces:**
- Consumes: `ensureNodeRuntimeStaged`, `validateNodeRuntime`, `platformNodeRuntimeDirName`, and `nodeExecutableName` from Task 1.
- Consumes: Rust launcher sidecar path `runtime/node/<platform>/<node executable>` from Task 2.
- Produces: package builds fail fast without `AIRDB_STANDALONE_NODE_RUNTIME` or `standalone/runtime/node/<platform>/<node executable>`.
- Produces: Tauri packaged resources include `runtime/node`.

- [ ] **Step 1: Write failing packaging-script integration change**

In `standalone/scripts/build-standalone.mjs`, add this import after the existing imports:

```js
import {
  ensureNodeRuntimeStaged,
  nodeExecutableName,
  platformNodeRuntimeDirName,
  validateNodeRuntime
} from "./node-runtime.mjs";
```

After `createPackagedDependencyLayout();`, add:

```js
const packagedNodeRuntime = ensureNodeRuntimeStaged({
  standaloneRoot,
  env: process.env,
  platform: process.platform,
  arch: process.arch
});
const packagedNodeVersion = validateNodeRuntime(packagedNodeRuntime);
console.log(
  `Packaged Node runtime ${packagedNodeVersion} at ${path.relative(standaloneRoot, packagedNodeRuntime)}`
);
```

In the `resourcePath` array, add:

```js
  `runtime/node/${platformNodeRuntimeDirName()}/${nodeExecutableName()}`,
```

- [ ] **Step 2: Run package without runtime input and verify fail-fast behavior**

Temporarily ensure no local staged Node binary exists:

```powershell
Remove-Item -Recurse -Force standalone/runtime/node/windows-x64 -ErrorAction SilentlyContinue
Remove-Item Env:\AIRDB_STANDALONE_NODE_RUNTIME -ErrorAction SilentlyContinue
npm --prefix standalone run package
```

Expected: FAIL before Tauri starts, with an error containing `Node runtime sidecar is required for packaging` and `AIRDB_STANDALONE_NODE_RUNTIME`.

- [ ] **Step 3: Add Tauri runtime resource mapping**

In `standalone/app/src-tauri/tauri.conf.json`, add this resource entry after the packaged `node_modules` entry:

```json
      "../../runtime/node": "runtime/node",
```

The resulting resources block should contain:

```json
    "resources": {
      "../../extension-host/dist": "extension-host/dist",
      "../../vscode-shim/dist": "vscode-shim/dist",
      "../../protocol/dist": "protocol/dist",
      "../../.packaged-resources/node_modules": "node_modules",
      "../../runtime/node": "runtime/node",
      "../../extensions": "extensions"
    }
```

- [ ] **Step 4: Update README packaging instructions**

In `standalone/README.md`, replace the current Packaging section text:

```md
Packaged builds include the compiled extension host, VS Code shim, protocol package, and prepared extensions as Tauri resources. They still shell out to `node`, so the installed application currently requires a Node.js runtime available on `PATH`. A future sidecar build can remove this runtime requirement by bundling a platform-specific Node binary.
```

with:

````md
Packaged builds include the compiled extension host, VS Code shim, protocol package, prepared extensions, and a platform-specific Node runtime sidecar as Tauri resources. The packaging command does not download Node; provide a runtime explicitly:

```powershell
$env:AIRDB_STANDALONE_NODE_RUNTIME = (node -p "process.execPath")
npm run package
Remove-Item Env:\AIRDB_STANDALONE_NODE_RUNTIME
```

`AIRDB_STANDALONE_NODE_RUNTIME` may point to a Node executable or to a directory containing `runtime/node/<platform>/<executable>`. For Windows x64 packaging, the staged runtime path is `standalone/runtime/node/windows-x64/node.exe`. The application still falls back to system `node` during development.
````

- [ ] **Step 5: Run script tests and Rust tests**

Run:

```powershell
npm --prefix standalone run test:scripts
cargo test --manifest-path standalone/app/src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 6: Run package with explicit runtime input**

Run:

```powershell
$env:AIRDB_STANDALONE_NODE_RUNTIME = (node -p "process.execPath")
npm --prefix standalone run package
Remove-Item Env:\AIRDB_STANDALONE_NODE_RUNTIME
```

Expected: PASS and produce:

```text
standalone/app/src-tauri/target/release/bundle/msi/AirDB Standalone_0.1.0_x64_en-US.msi
standalone/app/src-tauri/target/release/bundle/nsis/AirDB Standalone_0.1.0_x64-setup.exe
```

Also verify the staged runtime exists:

```powershell
Test-Path standalone/runtime/node/windows-x64/node.exe
```

Expected: `True`. The staged executable must remain untracked because of `.gitignore`.

- [ ] **Step 7: Run full regression verification**

Run:

```powershell
npm --prefix standalone run test
npm --prefix standalone run typecheck
npm --prefix standalone run build
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
npm --prefix standalone run smoke:webview-ipc
git status --short
```

Expected:

- All commands PASS.
- `git status --short` may show `?? .superpowers/`.
- `git status --short` must not show `standalone/runtime/node/windows-x64/node.exe`.

- [ ] **Step 8: Commit Task 3**

Run:

```powershell
git add standalone/scripts/build-standalone.mjs standalone/app/src-tauri/tauri.conf.json standalone/README.md
git commit -m "build: bundle node runtime sidecar"
```

---

## Final Verification

After all tasks are committed, run:

```powershell
npm --prefix standalone run test
npm --prefix standalone run typecheck
npm --prefix standalone run build
cargo test --manifest-path standalone/app/src-tauri/Cargo.toml
cargo check --manifest-path standalone/app/src-tauri/Cargo.toml
$env:AIRDB_STANDALONE_NODE_RUNTIME = (node -p "process.execPath")
npm --prefix standalone run package
Remove-Item Env:\AIRDB_STANDALONE_NODE_RUNTIME
npm --prefix standalone run smoke:webview-ipc
git status --short --branch
```

Expected:

- All commands PASS.
- Windows installers are produced under `standalone/app/src-tauri/target/release/bundle/`.
- `standalone/runtime/node/windows-x64/node.exe` exists locally and is ignored.
- No tracked files are dirty after commits.
- `.superpowers/` may remain untracked scratch.
