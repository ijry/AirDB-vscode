const assert = require("assert");
const { requireTs } = require("./testSetup");
const { createNeo4jConfig } = requireTs("src/service/connect/neo4jConnection.ts");

let config = createNeo4jConfig({});
assert.deepStrictEqual(config, {
  uri: "bolt://127.0.0.1:7687",
  user: "neo4j",
  password: "",
  database: "neo4j",
  connectTimeout: 5000,
  requestTimeout: 10000,
  encrypted: false,
});

config = createNeo4jConfig({
  host: "graph.local",
  port: "9999",
  user: "alice",
  password: "secret",
  database: "movies",
  useSSL: true,
  connectTimeout: "6000",
  requestTimeout: "12000",
});
assert.strictEqual(config.uri, "bolt+s://graph.local:9999");
assert.strictEqual(config.user, "alice");
assert.strictEqual(config.password, "secret");
assert.strictEqual(config.database, "movies");
assert.strictEqual(config.connectTimeout, 6000);
assert.strictEqual(config.requestTimeout, 12000);
assert.strictEqual(config.encrypted, true);

config = createNeo4jConfig({ connectionUrl: "neo4j://cluster.example.com", useSSL: true });
assert.strictEqual(config.uri, "neo4j://cluster.example.com");
assert.strictEqual(config.encrypted, true);

console.log("neo4jConnectionConfig tests passed");
