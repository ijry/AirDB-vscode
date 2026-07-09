const assert = require("assert");
const { requireTs } = require("./testSetup");

const { OracleDialect } = requireTs("src/service/dialect/oracleDialect.ts");

const dialect = new OracleDialect();

assert.match(dialect.showSchemas(), /FROM\s+ALL_OBJECTS/i);
assert.match(dialect.showSchemas(), /OWNER\s+"schema"/i);

assert.match(dialect.showTables("hr"), /FROM\s+ALL_TABLES/i);
assert.match(dialect.showTables("hr"), /t\.OWNER = 'HR'/i);

assert.match(dialect.showViews("hr"), /FROM\s+ALL_VIEWS/i);
assert.match(dialect.showViews("hr"), /OWNER = 'HR'/i);

assert.match(dialect.showColumns("hr", "employees"), /FROM\s+ALL_TAB_COLUMNS/i);
assert.match(dialect.showColumns("hr", "employees"), /c\.OWNER = 'HR'/i);
assert.match(dialect.showColumns("hr", "employees"), /c\.TABLE_NAME = 'EMPLOYEES'/i);

assert.strictEqual(
  dialect.buildPageSql("HR", "EMPLOYEES", 50),
  "SELECT * FROM HR.EMPLOYEES OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY"
);

assert.strictEqual(
  dialect.countSql("HR", "EMPLOYEES"),
  'SELECT count(*) "count" FROM HR.EMPLOYEES'
);

assert.strictEqual(
  dialect.pingDataBase("hr"),
  "ALTER SESSION SET CURRENT_SCHEMA = HR"
);

assert.strictEqual(dialect.pingDataBase(""), "SELECT 1 FROM DUAL");

console.log("oracleDialect tests passed");
