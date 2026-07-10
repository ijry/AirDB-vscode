const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const connect = read("src/vue/connect/index.vue");

assert.match(connect, /Doris:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/doris\.svg"\)/);
const supportDatabasesBlock = connect.match(/supportDatabases:\s*\[([\s\S]*?)\]/);
assert(supportDatabasesBlock, "supportDatabases list should exist");
const supportDatabases = Array.from(supportDatabasesBlock[1].matchAll(/"([^"]+)"/g)).map((match) => match[1]);
assert(supportDatabases.includes("Doris"));
assert(
  supportDatabases.indexOf("ClickHouse") < supportDatabases.indexOf("Doris"),
  "Doris should be listed after ClickHouse"
);
assert(
  supportDatabases.indexOf("Doris") < supportDatabases.indexOf("DuckDB"),
  "Doris should be listed before DuckDB"
);
assert.match(connect, /\[[^\]]*'Doris'[^\]]*'ClickHouse'[^\]]*'S3'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /\[[^\]]*'MySQL'[^\]]*'Doris'[^\]]*'ClickHouse'[^\]]*'ElasticSearch'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /case "Doris":[\s\S]*this\.connectionOption\.user = "root";[\s\S]*this\.connectionOption\.password = "";[\s\S]*this\.connectionOption\.port = 9030;[\s\S]*this\.connectionOption\.database = "";[\s\S]*this\.connectionOption\.useSSL = false;/);

const logo = read("resources/icon/doris.svg");
assert.match(logo, /<svg/);
assert.match(logo, /Doris/);

console.log("dorisUiConfig tests passed");
