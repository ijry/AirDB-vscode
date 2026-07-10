const assert = require("assert");
const { requireTs } = require("./testSetup");

const pgPath = require.resolve("pg");
const pgConfigs = [];
class FakeClient {
  constructor(config) {
    pgConfigs.push(config);
    this._connected = true;
    this._ending = false;
    this._queryable = true;
  }
  query() {}
  connect(callback) { callback && callback(null); }
  end() {}
  on() {}
}
require.cache[pgPath] = {
  id: pgPath,
  filename: pgPath,
  loaded: true,
  exports: {
    Client: FakeClient,
    types: { setTypeParser() {} },
  },
};

const { RedshiftConnection } = requireTs("src/service/connect/redshiftConnection.ts");
const { PostgreSqlConnection } = requireTs("src/service/connect/postgreSqlConnection.ts");

assert.strictEqual(
  Object.getPrototypeOf(RedshiftConnection.prototype),
  PostgreSqlConnection.prototype
);

const explicit = new RedshiftConnection({
  host: "example.redshift.amazonaws.com",
  port: 5440,
  user: "analytics_user",
  password: "secret",
  database: "analytics",
  dbType: "Redshift",
  useSSL: false,
  connectTimeout: 7000,
  requestTimeout: 11000,
});
assert(explicit instanceof PostgreSqlConnection);
assert(explicit instanceof RedshiftConnection);
assert.strictEqual(pgConfigs[0].host, "example.redshift.amazonaws.com");
assert.strictEqual(pgConfigs[0].port, 5440);
assert.strictEqual(pgConfigs[0].user, "analytics_user");
assert.strictEqual(pgConfigs[0].database, "analytics");
assert.strictEqual(pgConfigs[0].ssl, undefined);
assert.strictEqual(pgConfigs[0].connectionTimeoutMillis, 7000);
assert.strictEqual(pgConfigs[0].statement_timeout, 11000);

new RedshiftConnection({
  host: "example.redshift.amazonaws.com",
  password: "secret",
  dbType: "Redshift",
});
assert.strictEqual(pgConfigs[1].port, 5439);
assert.strictEqual(pgConfigs[1].user, "awsuser");
assert.strictEqual(pgConfigs[1].database, "dev");
assert.deepStrictEqual(pgConfigs[1].ssl, {
  rejectUnauthorized: false,
  ca: null,
  cert: null,
  key: null,
});

assert.deepStrictEqual(RedshiftConnection.normalizeNode({ dbType: "Redshift" }), {
  dbType: "Redshift",
  port: 5439,
  database: "dev",
  user: "awsuser",
  useSSL: true,
});

console.log("redshiftConnection tests passed");
