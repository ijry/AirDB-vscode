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

  it("resolves AIRDB_STANDALONE_NODE_RUNTIME when it points to a directory containing node.exe", () => {
    const root = tempRoot();
    const runtimeRoot = path.join(root, "node-runtime");
    const executable = path.join(runtimeRoot, "node.exe");
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
