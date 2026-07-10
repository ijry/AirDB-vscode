const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const constants = read("src/common/constants.ts");
assert.match(constants, /SNOWFLAKE\s*=\s*"Snowflake"/);

const node = read("src/model/interface/node.ts");
assert.match(node, /public account\?: string/);
assert.match(node, /public warehouse\?: string/);
assert.match(node, /public role\?: string/);
assert.match(node, /public authenticator\?: string/);
assert.match(node, /this\.account = source\.account/);
assert.match(node, /this\.warehouse = source\.warehouse/);
assert.match(node, /this\.role = source\.role/);
assert.match(node, /this\.authenticator = source\.authenticator/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /SnowflakeConnection/);
assert.match(connectionManager, /case DatabaseType\.SNOWFLAKE:[\s\S]*new SnowflakeConnection/);

const treeProvider = read("src/provider/treeDataProvider.ts");
const getKeyBlock = treeProvider.match(/private getKeyByNode[\s\S]*?return CacheKey\.DATBASE_CONECTIONS;/)[0];
assert.doesNotMatch(getKeyBlock, /DatabaseType\.SNOWFLAKE/);

const serviceManager = read("src/service/serviceManager.ts");
assert.match(serviceManager, /SnowflakeDialect/);
assert.match(serviceManager, /case DatabaseType\.SNOWFLAKE:[\s\S]*new SnowflakeDialect/);
assert.match(serviceManager, /case DatabaseType\.SNOWFLAKE:[\s\S]*new PostgreSqlPageService/);
assert.match(serviceManager, /case DatabaseType\.SNOWFLAKE:[\s\S]*new PostgresqlImortService/);

const connectionNode = read("src/model/database/connectionNode.ts");
assert.match(connectionNode, /icon\/snowflake\.svg/);
assert.match(connectionNode, /this\.dbType == DatabaseType\.SNOWFLAKE[\s\S]*this\.iconPath/);
assert.match(connectionNode, /this\.dbType != DatabaseType\.DORIS[\s\S]*this\.contextValue == ModelType\.CONNECTION/);
assert.match(connectionNode, /DatabaseType\.DORIS\)[\s\S]*\? databaseNode\.schema[\s\S]*: databaseNode\.database/);

const schemaNode = read("src/model/database/schemaNode.ts");
assert.match(schemaNode, /DatabaseType\.MSSQL \|\| this\.dbType == DatabaseType\.PG \|\| this\.dbType == DatabaseType\.REDSHIFT \|\| this\.dbType == DatabaseType\.SNOWFLAKE \|\| this\.dbType == DatabaseType\.KINGBASE/);

const tableGroup = read("src/model/main/tableGroup.ts");
assert.match(tableGroup, /DatabaseType\.MSSQL \|\| parent\.dbType == DatabaseType\.PG \|\| parent\.dbType == DatabaseType\.REDSHIFT \|\| parent\.dbType == DatabaseType\.SNOWFLAKE \|\| parent\.dbType == DatabaseType\.KINGBASE/);
assert.match(tableGroup, /this\.parent\.dbType == DatabaseType\.MSSQL \|\| this\.parent\.dbType == DatabaseType\.PG \|\| this\.parent\.dbType == DatabaseType\.REDSHIFT \|\| this\.parent\.dbType == DatabaseType\.SNOWFLAKE \|\| this\.parent\.dbType == DatabaseType\.KINGBASE/);

console.log("snowflakeRegistration tests passed");
