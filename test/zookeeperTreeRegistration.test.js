const assert = require("assert");
const path = require("path");
const { requireTs, vscodeStub, root } = require("./testSetup");

const opened = [];
vscodeStub.commands = {
  executeCommand(command, arg) {
    opened.push([command, arg && arg.fsPath ? arg.fsPath : arg]);
    return Promise.resolve();
  },
};
vscodeStub.Uri = { file: (fsPath) => ({ fsPath }) };
vscodeStub.window.showErrorMessage = (message) => opened.push(["error", message]);

const fakeConnection = {
  getRootPath: () => "/",
  listChildren: async (znodePath) => {
    if (znodePath === "/") return ["brokers", "config"];
    if (znodePath === "/brokers") return ["ids"];
    return [];
  },
  getData: async (znodePath) => Buffer.from(znodePath === "/config" ? "{\"ok\":true}" : "data"),
};

const connectionManagerStub = {
  ConnectionManager: {
    getConnection: async () => fakeConnection,
  },
};

for (const [relativePath, exports] of [
  ["src/provider/treeDataProvider.ts", { DbTreeDataProvider: { refresh() {}, instances: [] } }],
  ["src/service/common/databaseCache.ts", {
    DatabaseCache: {
      getElementState() { return vscodeStub.TreeItemCollapsibleState.Collapsed; },
      getChildCache() { return []; },
      setChildCache() {},
      clearDatabaseCache() {},
    },
  }],
  ["src/service/serviceManager.ts", { ServiceManager: { getDialect() { return null; } } }],
  ["src/service/connectionManager.ts", connectionManagerStub],
  ["src/service/queryUnit.ts", { QueryUnit: { queryPromise: async () => ({ rows: [] }) } }],
  ["src/common/filesManager.ts", {
    FileModel: { WRITE: 0, APPEND: 1 },
    FileManager: {
      record: async (fileName, content) => {
        opened.push(["record", fileName, content]);
        return path.resolve(root, ".tmp", fileName);
      },
    },
  }],
]) {
  const filename = path.resolve(root, relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

const { DatabaseType, ModelType } = requireTs("src/common/constants.ts");
const { ZooKeeperConnectionNode } = requireTs("src/model/zookeeper/zookeeperConnectionNode.ts");

(async () => {
  const rootNode = new ZooKeeperConnectionNode("k1", {
    key: "k1",
    dbType: DatabaseType.ZOOKEEPER,
    host: "127.0.0.1",
    port: 2181,
    database: "/",
  });
  assert.strictEqual(rootNode.contextValue, ModelType.ZOOKEEPER_CONNECTION);

  const rootChildren = await rootNode.getChildren();
  assert.deepStrictEqual(rootChildren.map((node) => node.label), ["/"]);
  assert.strictEqual(rootChildren[0].contextValue, ModelType.ZOOKEEPER_ZNODE);

  const znodes = await rootChildren[0].getChildren();
  assert.deepStrictEqual(znodes.map((node) => node.label), ["brokers", "config"]);
  assert.strictEqual(znodes[0].znodePath, "/brokers");

  const brokerChildren = await znodes[0].getChildren();
  assert.deepStrictEqual(brokerChildren.map((node) => node.label), ["ids"]);

  await znodes[1].open();
  assert.deepStrictEqual(opened.find((item) => item[0] === "record"), ["record", "temp/zookeeper/config.json", "{\"ok\":true}"]);
  assert.ok(opened.some((item) => item[0] === "vscode.open"));

  const original = connectionManagerStub.ConnectionManager.getConnection;
  connectionManagerStub.ConnectionManager.getConnection = async () => ({
    getRootPath: () => "/",
    listChildren: async () => { throw new Error("denied"); },
  });
  const errorNodes = await rootChildren[0].getChildren();
  assert.match(String(errorNodes[0].label), /List ZooKeeper children failed: denied/);
  connectionManagerStub.ConnectionManager.getConnection = original;

  console.log("zookeeperTreeRegistration tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
