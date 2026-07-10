const assert = require("assert");
const path = require("path");
const { requireTs, vscodeStub, root } = require("./testSetup");

vscodeStub.commands = vscodeStub.commands || { executeCommand() {} };

const fakeConnection = {
  listDatabases: async () => ["neo4j", "system"],
  listLabels: async (database) => database === "system" ? [] : ["Person", "Movie"],
  listRelationshipTypes: async () => ["ACTED_IN"],
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
]) {
  const filename = path.resolve(root, relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

const { DatabaseType, ModelType } = requireTs("src/common/constants.ts");
const { Neo4jConnectionNode } = requireTs("src/model/neo4j/neo4jConnectionNode.ts");

(async () => {
  const root = new Neo4jConnectionNode("k1", {
    key: "k1",
    dbType: DatabaseType.NEO4J,
    host: "127.0.0.1",
    port: 7687,
    database: "neo4j",
  });
  assert.strictEqual(root.contextValue, ModelType.NEO4J_CONNECTION);

  const groups = await root.getChildren();
  assert.deepStrictEqual(groups.map((node) => node.contextValue), [
    ModelType.NEO4J_DATABASE_GROUP,
    ModelType.NEO4J_LABEL_GROUP,
    ModelType.NEO4J_RELATIONSHIP_GROUP,
  ]);

  const databases = await groups[0].getChildren();
  assert.deepStrictEqual(databases.map((node) => node.label), ["neo4j", "system"]);
  assert.strictEqual(databases[0].contextValue, ModelType.NEO4J_DATABASE);

  const labels = await groups[1].getChildren();
  assert.deepStrictEqual(labels.map((node) => node.label), ["Movie", "Person"]);
  assert.strictEqual(labels[0].contextValue, ModelType.NEO4J_LABEL);

  const relationships = await groups[2].getChildren();
  assert.deepStrictEqual(relationships.map((node) => node.label), ["ACTED_IN"]);
  assert.strictEqual(relationships[0].contextValue, ModelType.NEO4J_RELATIONSHIP);

  const databaseChildren = await databases[1].getChildren();
  assert.deepStrictEqual(databaseChildren.map((node) => node.contextValue), [
    ModelType.NEO4J_LABEL_GROUP,
    ModelType.NEO4J_RELATIONSHIP_GROUP,
  ]);
  const emptyLabels = await databaseChildren[0].getChildren();
  assert.match(String(emptyLabels[0].label), /This Neo4j database has no label/);

  const original = connectionManagerStub.ConnectionManager.getConnection;
  connectionManagerStub.ConnectionManager.getConnection = async () => ({ listLabels: async () => { throw new Error("denied"); } });
  const errorLabels = await groups[1].getChildren();
  assert.match(String(errorLabels[0].label), /List Neo4j labels failed: denied/);

  connectionManagerStub.ConnectionManager.getConnection = original;
  console.log("neo4jTreeRegistration tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
