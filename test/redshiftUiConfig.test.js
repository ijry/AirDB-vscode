const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const connect = read("src/vue/connect/index.vue");

assert.match(connect, /Redshift:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/redshift\.svg"\)/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"PostgreSQL",\s*"Redshift"/);
assert.match(connect, /\[[^\]]*'PostgreSQL'[^\]]*'Redshift'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /\['MySQL', 'Doris', 'PostgreSQL', 'Redshift', 'ClickHouse', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch', 'Kafka', 'RabbitMQ'\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /case "Redshift":[\s\S]*this\.connectionOption\.user = "awsuser";[\s\S]*this\.connectionOption\.password = "";[\s\S]*this\.connectionOption\.port = 5439;[\s\S]*this\.connectionOption\.database = "dev";[\s\S]*this\.connectionOption\.useSSL = true;[\s\S]*this\.connectionOption\.connectTimeout = 5000;[\s\S]*this\.connectionOption\.requestTimeout = 10000;/);

const logo = read("resources/icon/redshift.svg");
assert.match(logo, /<svg/);
assert.match(logo, /Redshift/);

console.log("redshiftUiConfig tests passed");
