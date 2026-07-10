const assert = require("assert");
const { requireTs } = require("./testSetup");

const {
  createZooKeeperConfig,
  joinZooKeeperPath,
  normalizeZooKeeperPath,
} = requireTs("src/service/connect/zookeeperConnection.ts");

assert.deepStrictEqual(createZooKeeperConfig({}), {
  connectionString: "127.0.0.1:2181",
  rootPath: "/",
  authScheme: "digest",
  authValue: "",
  connectTimeout: 5000,
  requestTimeout: 10000,
});

assert.deepStrictEqual(createZooKeeperConfig({
  host: "zk1.local,zk2.local:2182",
  port: "2188",
  database: "app/config/",
  user: "air",
  password: "secret",
  zookeeperAuthScheme: "digest",
  connectTimeout: "6000",
  requestTimeout: "12000",
}), {
  connectionString: "zk1.local:2188,zk2.local:2182",
  rootPath: "/app/config",
  authScheme: "digest",
  authValue: "air:secret",
  connectTimeout: 6000,
  requestTimeout: 12000,
});

assert.strictEqual(createZooKeeperConfig({ connectionUrl: "zk-a:2181,zk-b:2181" }).connectionString, "zk-a:2181,zk-b:2181");
assert.strictEqual(normalizeZooKeeperPath(""), "/");
assert.strictEqual(normalizeZooKeeperPath("///a//b//"), "/a/b");
assert.strictEqual(joinZooKeeperPath("/", "brokers"), "/brokers");
assert.strictEqual(joinZooKeeperPath("/brokers", "/ids/"), "/brokers/ids");

console.log("zookeeperConnectionConfig tests passed");
