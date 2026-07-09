const assert = require("assert");
const path = require("path");
const { requireTs, root } = require("./testSetup");

const { Global } = requireTs("src/common/global.ts");
const {
  KINGBASE_DRIVER_RELATIVE_PATH,
  createMissingKingbaseDriverError,
  getKingbaseDriverPath,
  loadKingbaseDriverFromPath,
} = requireTs("src/service/connect/kingbaseDriverLoader.ts");

Global.context = { extensionPath: root };

assert.deepStrictEqual(KINGBASE_DRIVER_RELATIVE_PATH, [
  "resources",
  "drivers",
  "kingbase",
  "node_modules",
  "kb",
]);

assert.strictEqual(
  getKingbaseDriverPath(),
  path.join(root, "resources", "drivers", "kingbase", "node_modules", "kb")
);

function FakeClient() {}
const fakeDriver = { Client: FakeClient };
const loadedDriver = loadKingbaseDriverFromPath("virtual-driver-path", (id) => {
  assert.strictEqual(id, "virtual-driver-path");
  return fakeDriver;
});
assert.strictEqual(loadedDriver, fakeDriver);

assert.throws(
  () => loadKingbaseDriverFromPath("virtual-driver-path", () => ({})),
  /Kingbase official Nodejs driver is missing.*Driver did not export Client/
);

assert.throws(
  () =>
    loadKingbaseDriverFromPath("virtual-driver-path", () => {
      throw new Error("cannot find kb");
    }),
  /Kingbase official Nodejs driver is missing.*cannot find kb/
);

const error = createMissingKingbaseDriverError(new Error("missing package"));
assert.match(error.message, /resources\/drivers\/kingbase\/node_modules\/kb/);
assert.match(error.message, /missing package/);

const vendoredDriver = loadKingbaseDriverFromPath(
  path.join(root, "resources", "drivers", "kingbase", "node_modules", "kb"),
  require
);
assert.strictEqual(typeof vendoredDriver.Client, "function");

console.log("kingbaseDriverLoader tests passed");
