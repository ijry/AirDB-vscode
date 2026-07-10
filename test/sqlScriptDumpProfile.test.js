const assert = require("assert");
const { requireTs } = require("./testSetup");

const {
  createKingbaseDumpProfile,
  createDamengDumpProfile,
  buildInsertStatement,
  appendRoutineTerminator,
} = requireTs("src/service/dump/sqlScriptDumpProfile.ts");

const kingbase = createKingbaseDumpProfile();
const dameng = createDamengDumpProfile();

assert.strictEqual(kingbase.qualify("public", "demo"), "\"public\".\"demo\"");
assert.strictEqual(dameng.qualify("SYSDBA", "DEMO"), "\"SYSDBA\".\"DEMO\"");
assert.strictEqual(kingbase.dropTable("public", "demo"), "DROP TABLE IF EXISTS \"public\".\"demo\";");
assert.strictEqual(dameng.dropTable("SYSDBA", "DEMO"), "DROP TABLE IF EXISTS \"SYSDBA\".\"DEMO\";");

assert.strictEqual(
  buildInsertStatement(kingbase, "public", "demo", [{ id: 1, name: "AirDB" }]),
  "INSERT INTO \"public\".\"demo\" (\"id\",\"name\") VALUES (1,'AirDB');"
);
assert.strictEqual(
  buildInsertStatement(dameng, "SYSDBA", "DEMO", [{ ID: 1, NAME: null }]),
  "INSERT INTO \"SYSDBA\".\"DEMO\" (\"ID\",\"NAME\") VALUES (1,NULL);"
);

assert.strictEqual(
  appendRoutineTerminator(kingbase, "CREATE PROCEDURE p AS $$ BEGIN END; $$"),
  "CREATE PROCEDURE p AS $$ BEGIN END; $$;"
);
assert.strictEqual(
  appendRoutineTerminator(dameng, "CREATE OR REPLACE PROCEDURE P AS BEGIN NULL; END;"),
  "CREATE OR REPLACE PROCEDURE P AS BEGIN NULL; END;\n/"
);

console.log("sqlScriptDumpProfile tests passed");
