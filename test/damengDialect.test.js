const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DamengDialect } = requireTs("src/service/dialect/damengDialect.ts");

const dialect = new DamengDialect();

assert.match(dialect.showSchemas(), /ALL_USERS|SYSOBJECTS|INFORMATION_SCHEMA/i);
assert.match(dialect.showTables("SYSDBA"), /"name"/);
assert.match(dialect.showViews("SYSDBA"), /"name"/);
assert.match(dialect.showColumns("SYSDBA", "DEMO"), /"simpleType"/);
assert.match(dialect.showProcedures("SYSDBA"), /"ROUTINE_NAME"/);
assert.match(dialect.showFunctions("SYSDBA"), /"ROUTINE_NAME"/);
assert.match(dialect.showTriggers("SYSDBA"), /"TRIGGER_NAME"/);
assert.match(dialect.showProcedureSource("SYSDBA", "P_DEMO"), /"Create Procedure"/);
assert.match(dialect.showProcedureSource("SYSDBA", "P_DEMO"), /"CREATE_SQL"/);
assert.match(dialect.showFunctionSource("SYSDBA", "F_DEMO"), /"Create Function"/);
assert.match(dialect.showFunctionSource("SYSDBA", "F_DEMO"), /"CREATE_SQL"/);
assert.match(dialect.showTriggerSource("SYSDBA", "T_DEMO"), /"SQL Original Statement"/);
assert.match(dialect.showTriggerSource("SYSDBA", "T_DEMO"), /"CREATE_SQL"/);
assert.strictEqual(
  dialect.buildPageSql("SYSDBA", "DEMO", 20),
  "SELECT * FROM SYSDBA.DEMO OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY"
);
assert.strictEqual(dialect.countSql("SYSDBA", "DEMO"), 'SELECT count(*) "count" FROM SYSDBA.DEMO');
assert.match(dialect.procedureTemplate(), /CREATE OR REPLACE PROCEDURE/);
assert.match(dialect.procedureTemplate(), /\n\//);

console.log("damengDialect tests passed");
