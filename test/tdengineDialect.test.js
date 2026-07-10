const assert = require("assert");
const { requireTs } = require("./testSetup");

const { TDengineDialect } = requireTs("src/service/dialect/tdengineDialect.ts");

const dialect = new TDengineDialect();

assert.strictEqual(dialect.pingDataBase("meters"), "USE `meters`");
assert.strictEqual(dialect.pingDataBase(""), "SELECT 1");
assert.match(dialect.showSchemas(), /information_schema\.ins_databases/i);
assert.match(dialect.showSchemas(), /name AS schema/i);
assert.match(dialect.showDatabases(), /information_schema\.ins_databases/i);
assert.match(dialect.showDatabases(), /name AS `Database`/);
assert.match(dialect.showTables("meters"), /information_schema\.ins_tables/i);
assert.match(dialect.showTables("meters"), /db_name = 'meters'/);
assert.match(dialect.showTables("meters"), /table_name AS name/);
assert.match(dialect.showTables("meters"), /table_comment AS comment/);
assert.match(dialect.showColumns("meters", "d1001"), /information_schema\.ins_columns/i);
assert.match(dialect.showColumns("meters", "d1001"), /col_name AS name/);
assert.match(dialect.showColumns("meters", "d1001"), /table_name = 'd1001'/);
assert.strictEqual(dialect.buildPageSql("meters", "d1001", 100), "SELECT * FROM `meters`.`d1001` LIMIT 100;");
assert.strictEqual(dialect.countSql("meters", "d1001"), "SELECT COUNT(*) FROM `meters`.`d1001`;");
assert.strictEqual(dialect.createDatabase("my`db"), "CREATE DATABASE `my``db`");
assert.strictEqual(dialect.showTableSource("meters", "d1001"), "SHOW CREATE TABLE `meters`.`d1001`;");
assert.match(dialect.tableTemplate(), /CREATE TABLE \[name\]/);
assert.match(dialect.tableTemplate(), /ts TIMESTAMP/);
assert.strictEqual(dialect.showViews("meters"), "SELECT NULL AS name WHERE 1 = 0;");
assert.strictEqual(dialect.showProcedures("meters"), "SELECT NULL AS ROUTINE_NAME WHERE 1 = 0;");
assert.strictEqual(dialect.showFunctions("meters"), "SELECT NULL AS ROUTINE_NAME WHERE 1 = 0;");
assert.strictEqual(dialect.showTriggers("meters"), "SELECT NULL AS TRIGGER_NAME WHERE 1 = 0;");

console.log("tdengineDialect tests passed");
