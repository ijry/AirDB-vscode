const assert = require("assert");
const { requireTs } = require("./testSetup");

const { SnowflakeDialect } = requireTs("src/service/dialect/snowflakeDialect.ts");
const { SqlDialect } = requireTs("src/service/dialect/sqlDialect.ts");

const dialect = new SnowflakeDialect();

assert(dialect instanceof SqlDialect);
assert.strictEqual(dialect.createDatabase("analytics"), 'CREATE DATABASE "analytics"');
assert.strictEqual(dialect.pingDataBase("PUBLIC"), 'USE SCHEMA "PUBLIC";');
assert.strictEqual(dialect.pingDataBase(""), "SELECT 1");

assert.match(dialect.showDatabases(), /INFORMATION_SCHEMA\.DATABASES/i);
assert.match(dialect.showDatabases(), /DATABASE_NAME "Database"/);
assert.match(dialect.showDatabases(), /ORDER BY DATABASE_NAME/i);

assert.match(dialect.showSchemas(), /INFORMATION_SCHEMA\.SCHEMATA/i);
assert.match(dialect.showSchemas(), /CATALOG_NAME "Database"/);
assert.match(dialect.showSchemas(), /SCHEMA_NAME "schema"/);
assert.match(dialect.showSchemas(), /SCHEMA_NAME <> 'INFORMATION_SCHEMA'/);

assert.match(dialect.showTables("PUBLIC"), /INFORMATION_SCHEMA\.TABLES/i);
assert.match(dialect.showTables("PUBLIC"), /TABLE_SCHEMA = 'PUBLIC'/);
assert.match(dialect.showTables("PUBLIC"), /TABLE_TYPE = 'BASE TABLE'/);
assert.match(dialect.showTables("PUBLIC"), /TABLE_NAME "name"/);

assert.match(dialect.showViews("PUBLIC"), /INFORMATION_SCHEMA\.VIEWS/i);
assert.match(dialect.showViews("PUBLIC"), /TABLE_SCHEMA = 'PUBLIC'/);
assert.match(dialect.showViews("PUBLIC"), /TABLE_NAME "name"/);

assert.match(dialect.showColumns("PUBLIC", "ORDERS"), /INFORMATION_SCHEMA\.COLUMNS/i);
assert.match(dialect.showColumns("PUBLIC", "ORDERS"), /COLUMN_NAME "name"/);
assert.match(dialect.showColumns("PUBLIC", "ORDERS"), /DATA_TYPE "simpleType"/);
assert.match(dialect.showColumns("PUBLIC", "ORDERS"), /TABLE_SCHEMA = 'PUBLIC'/);
assert.match(dialect.showColumns("PUBLIC", "ORDERS"), /TABLE_NAME = 'ORDERS'/);
assert.match(dialect.showColumns("PUBLIC", "ORDERS"), /ORDER BY ORDINAL_POSITION/i);

assert.match(dialect.showProcedures("PUBLIC"), /INFORMATION_SCHEMA\.PROCEDURES/i);
assert.match(dialect.showFunctions("PUBLIC"), /INFORMATION_SCHEMA\.FUNCTIONS/i);
assert.match(dialect.showTableSource("PUBLIC", "ORDERS"), /GET_DDL\('TABLE'/);
assert.match(dialect.showViewSource("PUBLIC", "ORDER_VIEW"), /GET_DDL\('VIEW'/);
assert.match(dialect.showProcedureSource("PUBLIC", "REFRESH_ORDERS"), /GET_DDL\('PROCEDURE'/);
assert.match(dialect.showFunctionSource("PUBLIC", "TO_STATUS"), /GET_DDL\('FUNCTION'/);

assert.strictEqual(dialect.buildPageSql("PUBLIC", "ORDERS", 50), "SELECT * FROM ORDERS LIMIT 50;");
assert.strictEqual(dialect.countSql("PUBLIC", "ORDERS"), "SELECT COUNT(*) FROM ORDERS;");
assert.match(dialect.tableTemplate(), /AUTOINCREMENT/i);
assert.match(dialect.tableTemplate(), /TIMESTAMP_NTZ/i);
assert.match(dialect.procedureTemplate(), /LANGUAGE SQL/i);
assert.match(dialect.functionTemplate(), /LANGUAGE SQL/i);

assert.match(dialect.addColumnSql({
  table: "ORDERS",
  columnName: "STATUS",
  columnType: "VARCHAR(32)",
  nullable: false,
  defaultValue: "new",
  comment: "order status",
}), /ALTER TABLE ORDERS ADD COLUMN "STATUS" VARCHAR\(32\) DEFAULT 'new' NOT NULL COMMENT 'order status';/);

assert.match(dialect.showTables("O'HARE"), /TABLE_SCHEMA = 'O''HARE'/);

console.log("snowflakeDialect tests passed");
