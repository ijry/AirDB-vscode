const assert = require("assert");
const { EventEmitter } = require("events");
const { requireTs } = require("./testSetup");

const { KingbaseConnection } = requireTs("src/service/connect/kingbaseConnection.ts");

class FakeClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this._connected = true;
    this._ending = false;
    this._queryable = true;
    this.queries = [];
    this.results = [];
    FakeClient.instances.push(this);
  }

  connect(callback) {
    this.connectCalled = true;
    callback(null);
  }

  query(sql, values, callback) {
    if (typeof values === "function") {
      callback = values;
      values = undefined;
    }
    this.queries.push({ sql, values });
    const result =
      this.results.length > 0
        ? this.results.shift()
        : { command: "SELECT", rows: [{ id: 1 }], fields: [{ name: "id" }] };
    process.nextTick(() => callback(null, result));
  }

  end() {
    this._ending = true;
    this._connected = false;
  }
}

FakeClient.instances = [];

function buildConnection() {
  const node = {
    host: "127.0.0.1",
    port: 54321,
    user: "system",
    password: "pw",
    database: "test",
    connectTimeout: 7000,
    requestTimeout: 11000,
    useSSL: false,
  };
  const connection = new KingbaseConnection(node, { Client: FakeClient });
  return { connection, client: FakeClient.instances[FakeClient.instances.length - 1] };
}

function connect(connection) {
  return new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()));
  });
}

function query(connection, sql, values) {
  return new Promise((resolve, reject) => {
    const callback = (err, results, fields) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ results, fields });
    };
    if (arguments.length === 3) {
      connection.query(sql, values, callback);
    } else {
      connection.query(sql, callback);
    }
  });
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  const { connection, client } = buildConnection();

  assert.deepStrictEqual(client.config, {
    host: "127.0.0.1",
    port: 54321,
    user: "system",
    password: "pw",
    database: "test",
    connectionTimeoutMillis: 7000,
    statement_timeout: 11000,
  });

  assert.strictEqual(connection.isAlive(), true);
  await connect(connection);
  assert.strictEqual(client.connectCalled, true);

  const selectResult = await query(connection, "SELECT 1");
  assert.deepStrictEqual(selectResult.results, [{ id: 1 }]);
  assert.deepStrictEqual(selectResult.fields, [{ name: "id" }]);

  client.results.push({ command: "UPDATE", rowCount: 2, rows: [], fields: [] });
  const updateResult = await query(connection, "UPDATE demo SET name=$1", ["AirDB"]);
  assert.deepStrictEqual(updateResult.results, { affectedRows: 2 });
  assert.deepStrictEqual(client.queries[client.queries.length - 1], {
    sql: "UPDATE demo SET name=$1",
    values: ["AirDB"],
  });

  client.results.push({ command: "SELECT", rows: [{ id: 1 }, { id: 2 }], fields: [] });
  const event = connection.query("SELECT * FROM demo");
  const resultFlags = [];
  event.on("result", (_row, isLast) => resultFlags.push(isLast));
  await flush();
  assert.deepStrictEqual(resultFlags, [false, true]);

  client.results.push({ command: "SELECT", rows: [], fields: [] });
  const emptyEvent = connection.query("SELECT * FROM empty_demo");
  let ended = false;
  emptyEvent.on("end", () => {
    ended = true;
  });
  await flush();
  assert.strictEqual(ended, true);

  await new Promise((resolve) => connection.beginTransaction(resolve));
  await connection.rollback();
  await connection.commit();
  assert.deepStrictEqual(
    client.queries.slice(-3).map((entry) => entry.sql),
    ["BEGIN", "ROLLBACK", "COMMIT"]
  );

  connection.end();
  assert.strictEqual(connection.isAlive(), false);

  console.log("kingbaseConnection tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
