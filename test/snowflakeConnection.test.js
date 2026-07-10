const assert = require("assert");
const { once } = require("events");
const { requireTs } = require("./testSetup");

const snowflakePath = require.resolve("snowflake-sdk");
const createdConfigs = [];
const executions = [];

class FakeConnection {
  constructor(config) {
    this.config = config;
    this.up = false;
    this.destroyed = false;
  }
  isUp() {
    return this.up && !this.destroyed;
  }
  connect(callback) {
    this.up = true;
    callback && callback(null, this);
  }
  execute(options) {
    executions.push(options);
    setImmediate(() => {
      if (/select/i.test(options.sqlText)) {
        options.complete(null, { getNumRows() { return 2; } }, [{ ID: 1 }, { ID: 2 }]);
        return;
      }
      if (/error/i.test(options.sqlText)) {
        options.complete(new Error("boom"), { getNumRows() { return 0; } });
        return;
      }
      options.complete(null, {
        getNumRowsAffected() { return 3; },
        getNumRows() { return 0; },
      }, []);
    });
  }
  destroy(callback) {
    this.destroyed = true;
    this.up = false;
    callback && callback(null, this);
  }
}

require.cache[snowflakePath] = {
  id: snowflakePath,
  filename: snowflakePath,
  loaded: true,
  exports: {
    createConnection(config) {
      createdConfigs.push(config);
      return new FakeConnection(config);
    },
  },
};

const { SnowflakeConnection } = requireTs("src/service/connect/snowflakeConnection.ts");

(async () => {
  const connection = new SnowflakeConnection({
    account: "xy12345.ap-southeast-1.aws",
    host: "xy12345.snowflakecomputing.com",
    port: 9443,
    user: "AIRDB_USER",
    password: "secret",
    database: "ANALYTICS",
    schema: "PUBLIC",
    warehouse: "COMPUTE_WH",
    role: "SYSADMIN",
    authenticator: "SNOWFLAKE",
    dbType: "Snowflake",
    connectTimeout: 7000,
    requestTimeout: 11000,
  });

  assert.strictEqual(createdConfigs[0].account, "xy12345.ap-southeast-1.aws");
  assert.strictEqual(createdConfigs[0].host, "xy12345.snowflakecomputing.com");
  assert.strictEqual(createdConfigs[0].username, "AIRDB_USER");
  assert.strictEqual(createdConfigs[0].password, "secret");
  assert.strictEqual(createdConfigs[0].database, "ANALYTICS");
  assert.strictEqual(createdConfigs[0].schema, "PUBLIC");
  assert.strictEqual(createdConfigs[0].warehouse, "COMPUTE_WH");
  assert.strictEqual(createdConfigs[0].role, "SYSADMIN");
  assert.strictEqual(createdConfigs[0].authenticator, "SNOWFLAKE");
  assert.strictEqual(createdConfigs[0].application, "AirDB");
  assert.strictEqual(createdConfigs[0].clientSessionKeepAlive, true);
  assert.strictEqual(createdConfigs[0].timeout, 11000);

  assert.strictEqual(connection.isAlive(), false);
  await new Promise((resolve, reject) => connection.connect((err) => err ? reject(err) : resolve()));
  assert.strictEqual(connection.isAlive(), true);

  const selectRows = await new Promise((resolve, reject) => {
    connection.query("select * from orders", (err, rows) => err ? reject(err) : resolve(rows));
  });
  assert.deepStrictEqual(selectRows, [{ ID: 1 }, { ID: 2 }]);

  const dmlResult = await new Promise((resolve, reject) => {
    connection.query("update orders set status = ?", ["done"], (err, rows) => err ? reject(err) : resolve(rows));
  });
  assert.deepStrictEqual(dmlResult, { affectedRows: 3 });
  assert.deepStrictEqual(executions[1].binds, ["done"]);

  const event = connection.query("select * from dump_orders");
  const [firstRow] = await once(event, "result");
  assert.deepStrictEqual(firstRow, { ID: "1" });

  const error = await new Promise((resolve) => {
    connection.query("error statement", (err) => resolve(err));
  });
  assert.strictEqual(error.message, "boom");

  connection.end();
  assert.strictEqual(connection.isAlive(), false);

  new SnowflakeConnection({
    host: "account-only",
    dbType: "Snowflake",
  });
  assert.strictEqual(createdConfigs[1].account, "account-only");
  assert.strictEqual(createdConfigs[1].host, undefined);
  assert.strictEqual(createdConfigs[1].schema, "PUBLIC");
  assert.strictEqual(createdConfigs[1].authenticator, "SNOWFLAKE");
  assert.strictEqual(createdConfigs[1].timeout, 10000);

  assert.deepStrictEqual(SnowflakeConnection.normalizeNode({ dbType: "Snowflake" }), {
    dbType: "Snowflake",
    account: "",
    port: 443,
    schema: "PUBLIC",
    authenticator: "SNOWFLAKE",
    useSSL: true,
    connectTimeout: 5000,
    requestTimeout: 10000,
  });

  console.log("snowflakeConnection tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
