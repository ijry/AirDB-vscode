const assert = require("assert");
const { requireTs } = require("./testSetup");

const mysql2Path = require.resolve("mysql2");
const mysqlConfigs = [];
require.cache[mysql2Path] = {
  id: mysql2Path,
  filename: mysql2Path,
  loaded: true,
  exports: {
    createConnection(config) {
      mysqlConfigs.push(config);
      return {
        state: "authenticated",
        authorized: true,
        query() {},
        connect() {},
        beginTransaction() {},
        rollback() {},
        commit() {},
        end() {},
        on() {},
      };
    },
  },
};

const { DorisConnection } = requireTs("src/service/connect/dorisConnection.ts");
const { MysqlConnection } = requireTs("src/service/connect/mysqlConnection.ts");

assert.strictEqual(
  Object.getPrototypeOf(DorisConnection.prototype),
  MysqlConnection.prototype
);

const connection = new DorisConnection({
  host: "127.0.0.1",
  port: 9030,
  user: "root",
  password: "",
  database: "",
  dbType: "Doris",
});

assert(connection instanceof MysqlConnection);
assert(connection instanceof DorisConnection);
assert.strictEqual(mysqlConfigs[0].port, 9030);

new DorisConnection({
  host: "127.0.0.1",
  user: "root",
  password: "",
  database: "",
  dbType: "Doris",
});
assert.strictEqual(mysqlConfigs[1].port, 9030);

console.log("dorisConnection tests passed");
