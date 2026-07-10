import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import { checkPreparedExtensions } from "./check-prepared-extensions.mjs";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "check-prepared-extensions.mjs");
const tempRoots = [];

async function tempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "airdb-extension-set-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("prepared standalone extension set guard", () => {
  it("accepts only the prepared AirDB extension and .gitkeep", async () => {
    const extensionsDir = await prepareExtensionsDir();

    await checkPreparedExtensions({ extensionsDir });
  });

  it("rejects an extra extension directory", async () => {
    const extensionsDir = await prepareExtensionsDir();
    await fs.mkdir(path.join(extensionsDir, "other-extension"));

    await assert.rejects(
      () => checkPreparedExtensions({ extensionsDir }),
      /Prepared standalone extensions must contain only AirDB/
    );
  });

  it("rejects unexpected files next to bundled extensions", async () => {
    const extensionsDir = await prepareExtensionsDir();
    await fs.writeFile(path.join(extensionsDir, "notes.txt"), "unexpected");

    await assert.rejects(
      () => checkPreparedExtensions({ extensionsDir }),
      /Unexpected file\(s\) in standalone\/extensions: notes\.txt/
    );
  });

  it("rejects a prepared AirDB extension with missing runtime entry", async () => {
    const extensionsDir = await prepareExtensionsDir();
    await fs.rm(path.join(extensionsDir, "airdb", "out", "extension.js"));

    await assert.rejects(
      () => checkPreparedExtensions({ extensionsDir }),
      /Missing required AirDB extension entry: out\/extension\.js/
    );
  });

  it("rejects a mismatched extension identity", async () => {
    const extensionsDir = await prepareExtensionsDir({
      manifest: {
        name: "not-airdb",
        publisher: "jry"
      }
    });

    await assert.rejects(
      () => checkPreparedExtensions({ extensionsDir }),
      /Unexpected AirDB extension identity: jry\.not-airdb/
    );
  });

  it("honors AIRDB_STANDALONE_EXTENSIONS for the CLI entry point", async () => {
    const extensionsDir = await prepareExtensionsDir();
    const result = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        AIRDB_STANDALONE_EXTENSIONS: extensionsDir
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Prepared standalone extension set contains only AirDB\./);
    assert.equal(result.stderr, "");
  });

  it("returns a non-zero CLI status for invalid extension contents", async () => {
    const extensionsDir = await prepareExtensionsDir();
    await fs.mkdir(path.join(extensionsDir, "other-extension"));

    const result = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        AIRDB_STANDALONE_EXTENSIONS: extensionsDir
      },
      encoding: "utf8"
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Prepared standalone extensions must contain only AirDB/);
  });
});

async function prepareExtensionsDir({ manifest = { name: "airdb", publisher: "jry" } } = {}) {
  const root = await tempRoot();
  const extensionsDir = path.join(root, "extensions");
  const airdbDir = path.join(extensionsDir, "airdb");

  await fs.mkdir(path.join(airdbDir, "out"), { recursive: true });
  await fs.mkdir(path.join(airdbDir, "resources"), { recursive: true });
  await fs.mkdir(path.join(airdbDir, "syntaxes"), { recursive: true });
  await fs.mkdir(path.join(airdbDir, "l10n"), { recursive: true });
  await fs.writeFile(path.join(extensionsDir, ".gitkeep"), "");
  await fs.writeFile(path.join(airdbDir, "out", "extension.js"), "exports.activate = function activate() {};\n");
  await fs.writeFile(path.join(airdbDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  return extensionsDir;
}
