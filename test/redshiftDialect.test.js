const assert = require("assert");
const { requireTs } = require("./testSetup");

const { RedshiftDialect } = requireTs("src/service/dialect/redshiftDialect.ts");
const { PostgreSqlDialect } = requireTs("src/service/dialect/postgreSqlDialect.ts");

const dialect = new RedshiftDialect();

assert(dialect instanceof PostgreSqlDialect);
assert.strictEqual(dialect.createDatabase("analytics"), 'create database "analytics"');
assert.strictEqual(dialect.pingDataBase("analytics"), "set schema 'analytics';");
assert.strictEqual(dialect.pingDataBase(""), "select 1");

assert.match(dialect.showDatabases(), /SELECT datname "Database" FROM pg_database/i);
assert.match(dialect.showDatabases(), /datistemplate = false/);
assert.match(dialect.showDatabases(), /ORDER BY datname/);

assert.match(dialect.showSchemas(), /information_schema\.schemata/i);
assert.match(dialect.showSchemas(), /catalog_name "Database"/);
assert.match(dialect.showSchemas(), /schema_name "schema"/);
assert.match(dialect.showSchemas(), /schema_name NOT IN \('pg_catalog', 'information_schema'\)/);

assert.match(dialect.showTables("public"), /information_schema\.tables/i);
assert.match(dialect.showTables("public"), /table_schema = 'public'/);
assert.match(dialect.showTables("public"), /table_type = 'BASE TABLE'/);
assert.match(dialect.showTables("public"), /table_name "name"/);
assert.doesNotMatch(dialect.showTables("public"), /pg_catalog\.obj_description/);

assert.match(dialect.showViews("public"), /information_schema\.views/i);
assert.match(dialect.showViews("public"), /table_schema = 'public'/);
assert.match(dialect.showViews("public"), /table_name "name"/);

assert.match(dialect.showColumns("public", "orders"), /information_schema\.columns/i);
assert.match(dialect.showColumns("public", "orders"), /column_name "name"/);
assert.match(dialect.showColumns("public", "orders"), /data_type "simpleType"/);
assert.match(dialect.showColumns("public", "orders"), /table_schema = 'public'/);
assert.match(dialect.showColumns("public", "orders"), /table_name = 'orders'/);

assert.strictEqual(dialect.showTableSource("public", "orders"), "");
assert.match(dialect.tableTemplate(), /IDENTITY\(1,1\)/);
assert.match(dialect.tableTemplate(), /DISTSTYLE AUTO/);
assert.match(dialect.tableTemplate(), /SORTKEY/);
assert.doesNotMatch(dialect.tableTemplate(), /SERIAL/);
assert.match(dialect.procedureTemplate(), /LANGUAGE plpgsql/);
assert.match(dialect.functionTemplate(), /LANGUAGE SQL/);

console.log("redshiftDialect tests passed");
