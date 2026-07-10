const assert = require("assert");
const { EventEmitter, once } = require("events");
const { requireTs } = require("./testSetup");

const {
  TDengineConnection,
  createTDengineConfig,
} = requireTs("src/service/connect/tdengineConnection.ts");

class FakeClient {
  constructor(config) {
    this.config = config;
    this.closed = false;
    this.calls = [];
  }

  async query(sql) {
    this.calls.push(sql);
    if (/select rows/i.test(sql)) {
      return [{ ts: "2026-07-11 00:00:00.000", value: 42 }];
    }
    if (/affected/i.test(sql)) {
      return { affectedRows: 3 };
    }
    return [];
  }

  async close() {
    this.closed = true;
  }
}

async function queryPromise(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, rows, fields) => {
      if (err) reject(err);
      else resolve({ rows, fields });
    });
  });
}

async function connectPromise(connection) {
  return new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()));
  });
}

(async () => {
  const config = createTDengineConfig({ host: "", port: null, user: "", password: "", database: "", useSSL: false });
  assert.strictEqual(config.url, "ws://127.0.0.1:6041");
  assert.strictEqual(config.dsn, "ws://root:taosdata@127.0.0.1:6041");
  assert.strictEqual(config.user, "root");
  assert.strictEqual(config.password, "taosdata");
  assert.strictEqual(config.database, "");
  assert.strictEqual(config.connectTimeout, 5000);
  assert.strictEqual(config.requestTimeout, 10000);

  let receivedConfig;
  const connection = new TDengineConnection(
    { host: "td.local", port: 6041, user: "root", password: "secret", database: "meters", useSSL: true },
    (clientConfig) => {
      receivedConfig = clientConfig;
      return new FakeClient(clientConfig);
    }
  );

  await connectPromise(connection);
  assert.strictEqual(receivedConfig.url, "wss://td.local:6041");
  assert.strictEqual(receivedConfig.dsn, "wss://root:secret@td.local:6041");
  assert.strictEqual(connection.isAlive(), true);

  const select = await queryPromise(connection, "select rows");
  assert.deepStrictEqual(select.rows, [{ ts: "2026-07-11 00:00:00.000", value: 42 }]);
  assert.deepStrictEqual(select.fields, [{ name: "ts", nullable: "YES" }, { name: "value", nullable: "YES" }]);

  const affected = await queryPromise(connection, "affected");
  assert.deepStrictEqual(affected.rows, { affectedRows: 3 });

  const event = connection.query("select rows");
  assert.ok(event instanceof EventEmitter);
  const [row, last] = await once(event, "result");
  assert.deepStrictEqual(row, { ts: "'2026-07-11 00:00:00.000'", value: "42" });
  assert.strictEqual(last, true);

  connection.beginTransaction((err) => assert.strictEqual(err, null));
  connection.rollback();
  connection.commit();
  connection.end();
  assert.strictEqual(connection.isAlive(), false);
  assert.strictEqual(connection.client.closed, true);

  console.log("tdengineConnection tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
