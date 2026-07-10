const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const constants = read("src/common/constants.ts");
assert.match(constants, /DORIS\s*=\s*"Doris"/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /DorisConnection/);
assert.match(connectionManager, /case DatabaseType\.DORIS:[\s\S]*new DorisConnection/);

const serviceManager = read("src/service/serviceManager.ts");
assert.match(serviceManager, /DorisDialect/);
assert.match(serviceManager, /case DatabaseType\.DORIS:[\s\S]*new DorisDialect/);
assert.match(serviceManager, /case DatabaseType\.DORIS:[\s\S]*new MysqlPageSerivce/);
assert.match(serviceManager, /case DatabaseType\.DORIS:[\s\S]*new MysqlImportService/);
assert.match(serviceManager, /case DatabaseType\.DORIS:[\s\S]*new MysqlDumpService/);

const treeProvider = read("src/provider/treeDataProvider.ts");
const getKeyBlock = treeProvider.match(/private getKeyByNode[\s\S]*?return CacheKey\.DATBASE_CONECTIONS;/)[0];
assert.doesNotMatch(getKeyBlock, /DatabaseType\.DORIS/);
assert.match(treeProvider, /DatabaseType\.SQLITE \|\| cNode\.dbType == DatabaseType\.DUCKDB/);

const connectionNode = read("src/model/database/connectionNode.ts");
assert.match(connectionNode, /icon\/doris\.svg/);
assert.match(connectionNode, /this\.dbType != DatabaseType\.DORIS/);
assert.match(connectionNode, /DatabaseType\.DORIS[\s\S]*\? databaseNode\.schema/);

const schemaNode = read("src/model/database/schemaNode.ts");
assert.match(schemaNode, /DatabaseType\.MYSQL \|\| this\.dbType == DatabaseType\.DORIS/);

const tableGroup = read("src/model/main/tableGroup.ts");
assert.match(tableGroup, /DatabaseType\.DORIS/);
assert.match(tableGroup, /DatabaseType\.MYSQL \|\| parent\.dbType == DatabaseType\.ORACLE \|\| parent\.dbType == DatabaseType\.DAMENG \|\| parent\.dbType == DatabaseType\.CLICKHOUSE \|\| parent\.dbType == DatabaseType\.DORIS/);

const tableNode = read("src/model/main/tableNode.ts");
assert.match(tableNode, /DatabaseType\.MYSQL \|\| this\.dbType == DatabaseType\.SQLITE \|\| this\.dbType == DatabaseType\.DORIS/);

console.log("dorisRegistration tests passed");
