import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagedResourcesRoot = path.join(standaloneRoot, ".packaged-resources");
const packagedNodeModulesRoot = path.join(packagedResourcesRoot, "node_modules");

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

function assertExists(resourcePath, root = standaloneRoot) {
  const absolutePath = path.join(root, resourcePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Standalone package resource is missing: ${absolutePath}`);
    process.exit(1);
  }
}

function runtimePackageJson(packageDir) {
  const sourcePackageJson = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
  const packageJson = {
    name: sourcePackageJson.name,
    version: sourcePackageJson.version,
    type: sourcePackageJson.type,
    main: sourcePackageJson.main
  };

  if (sourcePackageJson.types) {
    packageJson.types = sourcePackageJson.types;
  }
  if (sourcePackageJson.dependencies) {
    packageJson.dependencies = sourcePackageJson.dependencies;
  }

  return packageJson;
}

function copyRuntimePackage(packageName, sourceRelativePath) {
  const sourcePackageDir = path.join(standaloneRoot, sourceRelativePath);
  const targetPackageDir = path.join(packagedNodeModulesRoot, ...packageName.split("/"));

  assertExists("package.json", sourcePackageDir);
  assertExists("dist/index.js", sourcePackageDir);

  fs.mkdirSync(targetPackageDir, { recursive: true });
  fs.writeFileSync(
    path.join(targetPackageDir, "package.json"),
    `${JSON.stringify(runtimePackageJson(sourcePackageDir), null, 2)}\n`
  );
  fs.cpSync(path.join(sourcePackageDir, "dist"), path.join(targetPackageDir, "dist"), {
    recursive: true,
    force: true,
    dereference: true
  });
}

function createPackagedDependencyLayout() {
  fs.rmSync(packagedNodeModulesRoot, { recursive: true, force: true });
  copyRuntimePackage("@airdb-standalone/protocol", "protocol");
  copyRuntimePackage("@airdb-standalone/vscode-shim", "vscode-shim");
  fs.writeFileSync(path.join(packagedNodeModulesRoot, ".gitkeep"), "");
}

function validatePackagedResolverLayout() {
  const checkRoot = path.join(packagedResourcesRoot, "__resolver-check__");
  const checkDir = path.join(checkRoot, "extension-host", "dist");
  const checkPath = path.join(checkDir, "check.mjs");

  fs.rmSync(checkRoot, { recursive: true, force: true });
  fs.mkdirSync(checkDir, { recursive: true });
  fs.writeFileSync(
    checkPath,
    [
      "import { createRequire } from 'node:module';",
      "const require = createRequire(import.meta.url);",
      "const shimPath = require.resolve('@airdb-standalone/vscode-shim');",
      "if (!shimPath.includes('node_modules')) throw new Error(`Unexpected shim resolution: ${shimPath}`);",
      "const protocolPath = require.resolve('@airdb-standalone/protocol');",
      "if (!protocolPath.includes('node_modules')) throw new Error(`Unexpected protocol resolution: ${protocolPath}`);",
      "const shim = await import('@airdb-standalone/vscode-shim');",
      "if (typeof shim.CommandRegistry !== 'function') throw new Error('Shim package did not load CommandRegistry');"
    ].join("\n")
  );

  const result = spawnSync(process.execPath, [checkPath], {
    cwd: packagedResourcesRoot,
    encoding: "utf8"
  });

  fs.rmSync(checkRoot, { recursive: true, force: true });

  if (result.status !== 0) {
    console.error("Packaged Node resolver validation failed.");
    if (result.stdout) {
      console.error(result.stdout);
    }
    if (result.stderr) {
      console.error(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
}

run(["run", "build"]);
run(["run", "build:airdb"]);
run(["run", "prepare:extensions"]);
createPackagedDependencyLayout();

for (const resourcePath of [
  "extension-host/dist/main.js",
  "vscode-shim/dist/index.js",
  "protocol/dist/index.js",
  "extensions",
  ".packaged-resources/node_modules/@airdb-standalone/vscode-shim/package.json",
  ".packaged-resources/node_modules/@airdb-standalone/vscode-shim/dist/index.js",
  ".packaged-resources/node_modules/@airdb-standalone/protocol/package.json",
  ".packaged-resources/node_modules/@airdb-standalone/protocol/dist/index.js"
]) {
  assertExists(resourcePath);
}
validatePackagedResolverLayout();

run(["run", "tauri", "--workspace", "@airdb-standalone/app", "--", "build"]);
