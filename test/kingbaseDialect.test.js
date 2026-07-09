const assert = require("assert");
const { requireTs } = require("./testSetup");

const { KingbaseDialect } = requireTs("src/service/dialect/kingbaseDialect.ts");
const { PostgreSqlDialect } = requireTs("src/service/dialect/postgreSqlDialect.ts");

const dialect = new KingbaseDialect();

assert(dialect instanceof PostgreSqlDialect);
assert.match(dialect.showDatabases(), /FROM pg_database/i);
assert.match(dialect.showSchemas(), /information_schema\.schemata/i);
assert.match(dialect.showTables("public"), /information_schema\.tables/i);
assert.strictEqual(dialect.pingDataBase("public"), "set schema 'public';");
assert.strictEqual(dialect.pingDataBase(""), "select 1");
assert.strictEqual(dialect.buildPageSql("public", "demo", 20), "SELECT * FROM demo LIMIT 20;");
assert.strictEqual(dialect.countSql("public", "demo"), "SELECT count(*) FROM demo;");

console.log("kingbaseDialect tests passed");
