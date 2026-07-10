const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DorisDialect } = requireTs("src/service/dialect/dorisDialect.ts");
const { MysqlDialect } = requireTs("src/service/dialect/mysqlDialect.ts");

const dialect = new DorisDialect();

assert(dialect instanceof MysqlDialect);
assert.strictEqual(dialect.createDatabase("analytics"), "CREATE DATABASE `analytics`");
assert.strictEqual(dialect.pingDataBase("analytics"), "use `analytics`");
assert.strictEqual(dialect.pingDataBase(""), "select 1");

assert.match(dialect.tableTemplate(), /ENGINE=OLAP/);
assert.match(dialect.tableTemplate(), /DUPLICATE KEY/);
assert.match(dialect.tableTemplate(), /DISTRIBUTED BY HASH/);
assert.match(dialect.tableTemplate(), /PROPERTIES/);

assert.match(dialect.showTables("analytics"), /information_schema\.TABLES/i);
assert.match(dialect.showTables("analytics"), /TABLE_SCHEMA = 'analytics'/);
assert.match(dialect.showTables("analytics"), /TABLE_TYPE <> 'VIEW'/);
assert.match(dialect.showTables("analytics"), /TABLE_NAME as `name`/);

assert.match(dialect.showViews("analytics"), /information_schema\.VIEWS/i);
assert.match(dialect.showViews("analytics"), /TABLE_SCHEMA = 'analytics'/);
assert.match(dialect.showViews("analytics"), /TABLE_NAME name/);

assert.match(dialect.showColumns("analytics", "orders"), /information_schema\.COLUMNS/i);
assert.match(dialect.showColumns("analytics", "orders"), /COLUMN_NAME name/);
assert.match(dialect.showColumns("analytics", "orders"), /DATA_TYPE simpleType/);
assert.match(dialect.showColumns("analytics", "orders"), /DATA_TYPE type/);
assert.match(dialect.showColumns("analytics", "orders"), /TABLE_NAME = 'orders'/);

console.log("dorisDialect tests passed");
