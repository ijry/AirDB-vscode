const assert = require("assert");
const { requireTs } = require("./testSetup");

const { KingbaseDialect } = requireTs("src/service/dialect/kingbaseDialect.ts");

const dialect = new KingbaseDialect();

assert.match(dialect.showProcedures("public"), /pg_proc/i);
assert.match(dialect.showProcedures("public"), /prokind\s*=\s*'p'/i);
assert.match(dialect.showFunctions("public"), /pg_proc/i);
assert.match(dialect.showFunctions("public"), /prokind\s+IN\s+\('f','a','w'\)/i);
assert.match(dialect.showProcedureSource("public", "demo_proc"), /pg_get_functiondef\(p\.oid\)/i);
assert.match(dialect.showProcedureSource("public", "demo_proc"), /"Create Procedure"/);
assert.match(dialect.showFunctionSource("public", "demo_fun"), /"Create Function"/);
assert.match(dialect.showTriggerSource("public", "demo_trigger"), /pg_get_triggerdef\(t\.oid\)/i);
assert.match(dialect.procedureTemplate(), /\$body\$/);
assert.match(dialect.functionTemplate(), /\$body\$/);

console.log("kingbaseRoutineDialect tests passed");
