const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DamengConnection } = requireTs("src/service/connect/damengConnection.ts");

class FakeDamengNativeConnection {
  constructor() {
    this.closed = false;
    this.results = [];
    this.executed = [];
    this.commitCalled = false;
    this.rollbackCalled = false;
    this.closeCalled = false;
  }

  execute(sql, values, options) {
    this.executed.push({ sql, values, options });
    const result =
      this.results.length > 0
        ? this.results.shift()
        : {
            rows: [{ ID: 1 }],
            metaData: [{ name: "ID", precision: 10 }],
          };
    return new Promise((resolve, reject) => {
      process.nextTick(() => {
        if (result instanceof Error) {
          reject(result);
          return;
        }
        resolve(result);
      });
    });
  }

  commit() {
    this.commitCalled = true;
    return Promise.resolve();
  }

  rollback() {
    this.rollbackCalled = true;
    return Promise.resolve();
  }

  close() {
    this.closeCalled = true;
    this.closed = true;
    return Promise.resolve();
  }
}

const fakeDriver = {
  OUT_FORMAT_OBJECT: 2,
  connections: [],
  configs: [],
  getConnection(config) {
    this.configs.push(config);
    const connection = new FakeDamengNativeConnection();
    this.connections.push(connection);
    return Promise.resolve(connection);
  },
};

function buildConnection() {
  fakeDriver.connections = [];
  fakeDriver.configs = [];
  const node = {
    host: "127.0.0.1",
    user: "SYSDBA",
    password: "SYSDBA",
    database: "SYSDBA",
    connectTimeout: 7000,
    requestTimeout: 11000,
  };
  return new DamengConnection(node, fakeDriver);
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
  const connection = buildConnection();
  await connect(connection);
  const native = fakeDriver.connections[0];

  assert.deepStrictEqual(fakeDriver.configs[0], {
    host: "127.0.0.1",
    port: 5236,
    user: "SYSDBA",
    password: "SYSDBA",
    schema: "SYSDBA",
    connectTimeout: 7000,
  });
  assert.strictEqual(connection.isAlive(), true);

  const selectResult = await query(connection, "SELECT 1");
  assert.deepStrictEqual(selectResult.results, [{ ID: 1 }]);
  assert.deepStrictEqual(selectResult.fields.map((field) => field.name), ["ID"]);
  assert.deepStrictEqual(native.executed[0].options, {
    outFormat: fakeDriver.OUT_FORMAT_OBJECT,
    autoCommit: true,
  });

  native.results.push({ rowsAffected: 2 });
  const updateResult = await query(connection, "UPDATE DEMO SET NAME=?", ["AirDB"]);
  assert.deepStrictEqual(updateResult.results, { affectedRows: 2 });
  assert.deepStrictEqual(native.executed[native.executed.length - 1].values, ["AirDB"]);

  native.results.push({
    rows: [{ ID: 1 }, { ID: 2 }],
    metaData: [{ name: "ID", precision: 10 }],
  });
  const event = connection.query("SELECT * FROM DEMO");
  const resultFlags = [];
  event.on("result", (_row, isLast) => resultFlags.push(isLast));
  await flush();
  assert.deepStrictEqual(resultFlags, [false, true]);

  let uncaughtError = null;
  const uncaughtHandler = (err) => {
    uncaughtError = err;
  };
  process.once("uncaughtException", uncaughtHandler);

  native.results.push(new Error("callback failure"));
  const callbackError = await new Promise((resolve) => {
    connection.query("SELECT * FROM BROKEN", (err) => {
      resolve(err);
    });
  });
  await flush();
  process.removeListener("uncaughtException", uncaughtHandler);
  assert(callbackError instanceof Error);
  assert.strictEqual(callbackError.message, "callback failure");
  assert.strictEqual(uncaughtError, null);

  native.results.push(new Error("event failure"));
  const errorEvent = connection.query("SELECT * FROM BROKEN_EVENT");
  let emittedError = null;
  errorEvent.on("error", (err) => {
    emittedError = err;
  });
  await flush();
  assert.strictEqual(emittedError, "event failure");

  await new Promise((resolve) => connection.beginTransaction(resolve));
  native.results.push({ rowsAffected: 1 });
  await query(connection, "UPDATE DEMO SET ID=ID");
  assert.strictEqual(native.executed[native.executed.length - 1].options.autoCommit, false);
  await connection.rollback();
  assert.strictEqual(native.rollbackCalled, true);
  await new Promise((resolve) => connection.beginTransaction(resolve));
  await connection.commit();
  assert.strictEqual(native.commitCalled, true);

  connection.end();
  await flush();
  assert.strictEqual(native.closeCalled, true);
  assert.strictEqual(connection.isAlive(), false);

  console.log("damengConnection tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
