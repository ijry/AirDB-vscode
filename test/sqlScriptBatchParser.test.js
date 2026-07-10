const assert = require("assert");
const { requireTs } = require("./testSetup");

const { parseSqlScriptBatches } = requireTs("src/service/import/sqlScriptBatchParser.ts");

assert.deepStrictEqual(parseSqlScriptBatches("select 1; select 2;"), ["select 1", "select 2"]);
assert.deepStrictEqual(parseSqlScriptBatches("select ';' as semi;"), ["select ';' as semi"]);
assert.deepStrictEqual(parseSqlScriptBatches("select 1; -- comment ;\nselect 2;"), ["select 1", "-- comment ;\nselect 2"]);
assert.deepStrictEqual(parseSqlScriptBatches("select /* ; */ 1;"), ["select /* ; */ 1"]);

const kingbaseProcedure = `
CREATE PROCEDURE public.demo_proc()
LANGUAGE plpgsql
AS $body$
BEGIN
  RAISE NOTICE 'a;b';
END;
$body$;
SELECT 1;
`;
assert.deepStrictEqual(parseSqlScriptBatches(kingbaseProcedure, "kingbase"), [
  "CREATE PROCEDURE public.demo_proc()\nLANGUAGE plpgsql\nAS $body$\nBEGIN\n  RAISE NOTICE 'a;b';\nEND;\n$body$",
  "SELECT 1",
]);

const damengProcedure = `
CREATE OR REPLACE PROCEDURE DEMO_PROC
AS
BEGIN
  SELECT 1;
END;
/
SELECT 2;
`;
assert.deepStrictEqual(parseSqlScriptBatches(damengProcedure, "dameng"), [
  "CREATE OR REPLACE PROCEDURE DEMO_PROC\nAS\nBEGIN\n  SELECT 1;\nEND;",
  "SELECT 2",
]);

console.log("sqlScriptBatchParser tests passed");
