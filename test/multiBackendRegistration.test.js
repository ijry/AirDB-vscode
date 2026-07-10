const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
assert.ok(pkg.dependencies["@clickhouse/client"], "@clickhouse/client dependency registered");
assert.ok(pkg.dependencies.duckdb, "duckdb dependency registered");
assert.ok(pkg.dependencies.amqplib, "amqplib dependency registered");

const webpackConfig = read("webpack.config.js");
assert.match(webpackConfig, /'@clickhouse\/client':\s*'commonjs @clickhouse\/client'/);
assert.match(webpackConfig, /duckdb:\s*'commonjs duckdb'/);
assert.match(webpackConfig, /amqplib:\s*'commonjs amqplib'/);

const vscodeIgnore = read(".vscodeignore");
assert.match(vscodeIgnore, /node_modules\/\*/);
assert.match(vscodeIgnore, /!node_modules\/@clickhouse\/client\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/@clickhouse\/client-common\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/duckdb\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/@mapbox\/node-pre-gyp\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/amqplib\/\*\*/);

const constants = read("src/common/constants.ts");
assert.match(constants, /CLICKHOUSE\s*=\s*"ClickHouse"/);
assert.match(constants, /DUCKDB\s*=\s*"DuckDB"/);
assert.match(constants, /RABBITMQ\s*=\s*"RabbitMQ"/);
assert.match(constants, /RABBITMQ_CONNECTION\s*=\s*"rabbitmqConnection"/);
assert.match(constants, /RABBITMQ_QUEUE\s*=\s*"rabbitmqQueue"/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /ClickHouseConnection/);
assert.match(connectionManager, /DuckDBConnection/);
assert.match(connectionManager, /RabbitMQConnection/);
assert.match(connectionManager, /case DatabaseType\.CLICKHOUSE:[\s\S]*new ClickHouseConnection/);
assert.match(connectionManager, /case DatabaseType\.DUCKDB:[\s\S]*new DuckDBConnection/);
assert.match(connectionManager, /case DatabaseType\.RABBITMQ:[\s\S]*new RabbitMQConnection/);

const serviceManager = read("src/service/serviceManager.ts");
assert.match(serviceManager, /ClickHouseDialect/);
assert.match(serviceManager, /DuckDBDialect/);
assert.match(serviceManager, /case DatabaseType\.CLICKHOUSE:[\s\S]*new ClickHouseDialect/);
assert.match(serviceManager, /case DatabaseType\.DUCKDB:[\s\S]*new DuckDBDialect/);
assert.match(serviceManager, /case DatabaseType\.CLICKHOUSE:[\s\S]*new PostgreSqlPageService/);
assert.match(serviceManager, /case DatabaseType\.DUCKDB:[\s\S]*new PostgreSqlPageService/);

const treeProvider = read("src/provider/treeDataProvider.ts");
assert.match(treeProvider, /RabbitMQConnectionNode/);
assert.match(treeProvider, /dbType == DatabaseType\.RABBITMQ/);
assert.match(treeProvider, /new RabbitMQConnectionNode/);
assert.match(treeProvider, /DatabaseType\.SQLITE \|\| cNode\.dbType == DatabaseType\.DUCKDB/);

const connectionNode = read("src/model/database/connectionNode.ts");
assert.match(connectionNode, /this\.dbType == DatabaseType\.DUCKDB[\s\S]*this\.label = this\.dbPath/);
assert.match(connectionNode, /icon\/duckdb\.svg/);
assert.match(connectionNode, /icon\/clickhouse\.svg/);
assert.match(connectionNode, /DatabaseType\.SQLITE \|\| this\.dbType == DatabaseType\.DUCKDB/);
assert.match(connectionNode, /this\.dbType != DatabaseType\.CLICKHOUSE/);
assert.match(connectionNode, /DatabaseType\.CLICKHOUSE\)[\s\S]*\? databaseNode\.schema/);

console.log("multiBackendRegistration tests passed");
