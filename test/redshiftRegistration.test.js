const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const constants = read("src/common/constants.ts");
assert.match(constants, /REDSHIFT\s*=\s*"Redshift"/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /RedshiftConnection/);
assert.match(connectionManager, /case DatabaseType\.REDSHIFT:[\s\S]*new RedshiftConnection/);

const postgreSqlConnection = read("src/service/connect/postgreSqlConnection.ts");
assert.match(postgreSqlConnection, /protected createClient\(config: ClientConfig\): Client/);
assert.match(postgreSqlConnection, /this\.client = this\.createClient\(config\)/);

const redshiftConnection = read("src/service/connect/redshiftConnection.ts");
assert.match(redshiftConnection, /export class RedshiftConnection extends PostgreSqlConnection/);
assert.match(redshiftConnection, /static normalizeNode\(node: Node\): Node/);
assert.match(redshiftConnection, /port: node\.port \|\| 5439/);
assert.match(redshiftConnection, /database: node\.database \|\| "dev"/);
assert.match(redshiftConnection, /user: node\.user \|\| "awsuser"/);
assert.match(redshiftConnection, /useSSL: node\.useSSL == null \? true : node\.useSSL/);

const treeProvider = read("src/provider/treeDataProvider.ts");
const getKeyBlock = treeProvider.match(/private getKeyByNode[\s\S]*?return CacheKey\.DATBASE_CONECTIONS;/)[0];
assert.doesNotMatch(getKeyBlock, /DatabaseType\.REDSHIFT/);

const serviceManager = read("src/service/serviceManager.ts");
assert.match(serviceManager, /RedshiftDialect/);
assert.match(serviceManager, /case DatabaseType\.REDSHIFT:[\s\S]*new RedshiftDialect/);
assert.match(serviceManager, /case DatabaseType\.REDSHIFT:[\s\S]*new PostgreSqlPageService/);
assert.match(serviceManager, /case DatabaseType\.REDSHIFT:[\s\S]*new PostgresqlImortService/);

const connectionNode = read("src/model/database/connectionNode.ts");
assert.match(connectionNode, /icon\/redshift\.svg/);
assert.match(connectionNode, /this\.dbType == DatabaseType\.REDSHIFT[\s\S]*this\.iconPath/);

const schemaNode = read("src/model/database/schemaNode.ts");
assert.match(schemaNode, /DatabaseType\.MSSQL \|\| this\.dbType == DatabaseType\.PG \|\| this\.dbType == DatabaseType\.REDSHIFT \|\| this\.dbType == DatabaseType\.KINGBASE/);

const tableGroup = read("src/model/main/tableGroup.ts");
assert.match(tableGroup, /DatabaseType\.MSSQL \|\| parent\.dbType == DatabaseType\.PG \|\| parent\.dbType == DatabaseType\.REDSHIFT \|\| parent\.dbType == DatabaseType\.KINGBASE/);
assert.match(tableGroup, /this\.parent\.dbType == DatabaseType\.MSSQL \|\| this\.parent\.dbType == DatabaseType\.PG \|\| this\.parent\.dbType == DatabaseType\.REDSHIFT \|\| this\.parent\.dbType == DatabaseType\.KINGBASE/);

console.log("redshiftRegistration tests passed");
