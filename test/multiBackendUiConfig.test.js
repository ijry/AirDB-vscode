const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const connect = read("src/vue/connect/index.vue");

assert.match(connect, /import DuckDB from "\.\/component\/DuckDB\.vue"/);
assert.match(connect, /import RabbitMQ from "\.\/component\/RabbitMQ\.vue"/);
assert.match(connect, /components: \{[\s\S]*DuckDB[\s\S]*RabbitMQ/);

assert.match(connect, /ClickHouse:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/clickhouse\.svg"\)/);
assert.match(connect, /DuckDB:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/duckdb\.svg"\)/);
assert.match(connect, /RabbitMQ:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/rabbitmq\.svg"\)/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"ClickHouse"[\s\S]*"DuckDB"[\s\S]*"RabbitMQ"/);

assert.match(connect, /<RabbitMQ\s+v-else-if="connectionOption\.dbType == 'RabbitMQ'"/);
assert.match(connect, /<DuckDB[\s\S]*v-else-if="connectionOption\.dbType == 'DuckDB'"[\s\S]*@choose="choose\('duckdb'\)"/);
assert.match(connect, /case "duckdb":[\s\S]*filters\["DuckDB"\] = \["duckdb", "db"\]/);
assert.match(connect, /connectionOption\.dbType != 'DuckDB'/);
assert.match(connect, /\[[^\]]*'ClickHouse'[^\]]*'RabbitMQ'[^\]]*\]\.includes\(connectionOption\.dbType\)/);

assert.match(connect, /case "ClickHouse":[\s\S]*this\.connectionOption\.user = "default";[\s\S]*this\.connectionOption\.port = 8123;[\s\S]*this\.connectionOption\.database = "default";/);
assert.match(connect, /case "DuckDB":[\s\S]*this\.connectionOption\.port = null;[\s\S]*this\.connectionOption\.dbPath = "";/);
assert.match(connect, /case "RabbitMQ":[\s\S]*this\.connectionOption\.user = "guest";[\s\S]*this\.connectionOption\.port = 5672;[\s\S]*this\.connectionOption\.managementPort = 15672;/);

const duckdb = read("src/vue/connect/component/DuckDB.vue");
assert.match(duckdb, /Database File/);
assert.match(duckdb, /connectionOption\.dbPath/);
assert.match(duckdb, /\$emit\('choose', 'duckdb'\)/);

const rabbitmq = read("src/vue/connect/component/RabbitMQ.vue");
assert.match(rabbitmq, /AMQP Port/);
assert.match(rabbitmq, /Management Port/);
assert.match(rabbitmq, /connectionOption\.managementPort/);
assert.match(rabbitmq, /connectionOption\.vhost/);
assert.match(rabbitmq, /connectionOption\.database = value/);

console.log("multiBackendUiConfig tests passed");
