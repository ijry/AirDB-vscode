const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const connect = read("src/vue/connect/index.vue");

assert.match(connect, /Doris:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/doris\.svg"\)/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"ClickHouse",\s*"Doris",\s*"DuckDB"/);
assert.match(connect, /connectionOption\.dbType == 'Doris' \|\|[\s\S]*connectionOption\.dbType == 'ClickHouse'/);
assert.match(connect, /\[[^\]]*'MySQL'[^\]]*'Doris'[^\]]*'ClickHouse'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /case "Doris":[\s\S]*this\.connectionOption\.user = "root";[\s\S]*this\.connectionOption\.password = "";[\s\S]*this\.connectionOption\.port = 9030;[\s\S]*this\.connectionOption\.database = "";[\s\S]*this\.connectionOption\.useSSL = false;/);

const logo = read("resources/icon/doris.svg");
assert.match(logo, /<svg/);
assert.match(logo, /Doris/);

console.log("dorisUiConfig tests passed");
