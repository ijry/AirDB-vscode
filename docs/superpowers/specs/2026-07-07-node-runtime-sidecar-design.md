# Node Runtime Sidecar Design

## Goal

Make packaged AirDB Standalone installers run the Node-based extension host without requiring `node` on the user's `PATH`.

## Context

The standalone host now packages compiled extension-host JavaScript, the VS Code shim, protocol package, built-in extensions, and a Node-resolvable package graph. The remaining runtime dependency is in `standalone/app/src-tauri/src/main.rs`, where the backend launches the extension host with `Command::new("node")`.

This is acceptable for development but not for an independently installed desktop application.

## Recommended Approach

Bundle a platform-specific Node executable as a Tauri resource and make the Rust launcher prefer it at runtime.

The build should not download Node implicitly. The packaging step must consume a caller-provided Node runtime path or a checked-in/local runtime staging path. This keeps the repository deterministic and avoids silently adding a large third-party binary.

## Runtime Resolution Order

The extension host launcher resolves the Node executable in this order:

1. `AIRDB_STANDALONE_NODE`, if set.
2. Packaged sidecar runtime under the Tauri resource root.
3. `node` on `PATH` as a development fallback.

If all candidates fail, the error must explain how to fix it: set `AIRDB_STANDALONE_NODE` for development or provide the sidecar runtime before packaging.

## Packaged Resource Layout

Use a resource layout that is explicit and platform-scoped:

```text
runtime/
  node/
    windows-x64/
      node.exe
```

The initial implementation targets the current Windows packaging path. The directory name should be selected by the build script from Node's `process.platform` and `process.arch` values, using `windows-x64` for `win32/x64`.

Future platforms can add:

```text
runtime/node/darwin-arm64/node
runtime/node/darwin-x64/node
runtime/node/linux-x64/node
```

## Build Inputs

`standalone/scripts/build-standalone.mjs` should support these inputs:

- `AIRDB_STANDALONE_NODE_RUNTIME`: absolute or relative path to a Node executable or a directory containing the executable for the current platform.
- `standalone/runtime/node/<platform>/node.exe`: optional local staging path for developers or CI.

The packaging command should fail fast if neither input exists. Development commands remain allowed to use system `node`.

## Tauri Packaging

`standalone/app/src-tauri/tauri.conf.json` should bundle:

```json
"../../runtime/node": "runtime/node"
```

The existing extension-host resources and packaged `node_modules` layout remain unchanged.

## Rust Launcher

Add a small pure helper in `main.rs` that selects the Node executable from:

- environment override
- resource-root sidecar path
- fallback command name

`spawn_extension_host` should call this helper and use `Command::new(resolved_node)` instead of `Command::new("node")`.

The helper must be testable without constructing a `tauri::AppHandle`.

## Verification

Required verification:

- Unit tests for Node executable resolution order.
- A packaging validation in `build-standalone.mjs` that runs the selected sidecar Node with `--version`.
- A package run that produces Windows installers.
- Existing app and Rust tests still pass.

## Non-Goals

- Do not rewrite the extension host in Rust.
- Do not embed a JavaScript engine into the Tauri backend.
- Do not implement automatic Node downloads in this change.
- Do not bundle npm, headers, or a full Node distribution unless a concrete extension requires it later.
- Do not remove the development fallback to system `node`.

## Risks

Bundling Node increases installer size. The exact increase depends on the supplied runtime, but it is the cost of making VS Code-style extensions run without a user-installed Node runtime.

Some extensions may spawn child processes or depend on native modules. This design only guarantees that the standalone extension host process starts; native module and child-process compatibility remains extension-specific.
