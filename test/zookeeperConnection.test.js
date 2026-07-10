const assert = require("assert");
const { requireTs } = require("./testSetup");

const {
  ZooKeeperConnection,
  joinZooKeeperPath,
} = requireTs("src/service/connect/zookeeperConnection.ts");

function createFakeClient(calls) {
  const handlers = {};
  return {
    on(event, handler) {
      handlers[event] = handlers[event] || [];
      handlers[event].push(handler);
      return this;
    },
    once(event, handler) {
      const wrapped = (...args) => {
        this.removeListener(event, wrapped);
        handler(...args);
      };
      return this.on(event, wrapped);
    },
    removeListener(event, handler) {
      handlers[event] = (handlers[event] || []).filter((item) => item !== handler);
      return this;
    },
    emit(event, value) {
      for (const handler of handlers[event] || []) handler(value);
    },
    addAuthInfo(scheme, auth) {
      calls.push(["auth", scheme, auth.toString()]);
    },
    connect() {
      calls.push(["connect"]);
      setImmediate(() => this.emit("connected"));
    },
    close() {
      calls.push(["close"]);
    },
    getChildren(path, callback) {
      calls.push(["getChildren", path]);
      callback(null, path === "/" ? ["brokers", "config"] : ["ids"]);
    },
    getData(path, callback) {
      calls.push(["getData", path]);
      callback(null, Buffer.from(path === "/config" ? "{\"ok\":true}" : "data"), { version: 1 });
    },
    exists(path, callback) {
      calls.push(["exists", path]);
      callback(null, { path, version: 2 });
    },
  };
}

(async () => {
  const calls = [];
  const connection = new ZooKeeperConnection({
    host: "zk.local",
    port: 2181,
    database: "/",
    user: "air",
    password: "secret",
  }, (connectionString, options) => {
    calls.push(["factory", connectionString, options.sessionTimeout]);
    return createFakeClient(calls);
  });

  await new Promise((resolve, reject) => connection.connect((err) => err ? reject(err) : resolve()));
  assert.strictEqual(connection.isAlive(), true);
  assert.deepStrictEqual(calls.slice(0, 3), [
    ["factory", "zk.local:2181", 5000],
    ["auth", "digest", "air:secret"],
    ["connect"],
  ]);

  assert.deepStrictEqual(await connection.listChildren("/"), ["brokers", "config"]);
  assert.deepStrictEqual(await connection.getData("/config"), Buffer.from("{\"ok\":true}"));
  assert.deepStrictEqual(await connection.getStat("/config"), { path: "/config", version: 2 });
  assert.strictEqual(connection.getRootPath(), "/");
  assert.strictEqual(joinZooKeeperPath("/brokers", "ids"), "/brokers/ids");

  await new Promise((resolve) => {
    connection.query("select 1", (err) => {
      assert.match(err.message, /does not support SQL query/);
      resolve();
    });
  });

  connection.end();
  assert.strictEqual(connection.isAlive(), false);
  assert.ok(calls.some((call) => call[0] === "close"));

  console.log("zookeeperConnection tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
