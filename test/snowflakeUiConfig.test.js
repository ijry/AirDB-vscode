const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const connect = read("src/vue/connect/index.vue");
const component = read("src/vue/connect/component/Snowflake.vue");

assert.match(connect, /import Snowflake from "\.\/component\/Snowflake\.vue"/);
assert.match(connect, /<Snowflake\s+v-else-if="connectionOption\.dbType == 'Snowflake'"/);
assert.match(connect, /components:\s*\{[\s\S]*Snowflake/);
assert.match(connect, /Snowflake:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/snowflake\.svg"\)/);
assert.match(connect, /"Redshift",\s*"Snowflake",\s*"ClickHouse"/);
assert.match(connect, /\[[^\]]*'Redshift'[^\]]*'Snowflake'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /case "Snowflake":[\s\S]*this\.connectionOption\.account = "";[\s\S]*this\.connectionOption\.host = "";[\s\S]*this\.connectionOption\.port = 443;[\s\S]*this\.connectionOption\.user = "";[\s\S]*this\.connectionOption\.schema = "PUBLIC";[\s\S]*this\.connectionOption\.warehouse = "";[\s\S]*this\.connectionOption\.role = "";[\s\S]*this\.connectionOption\.authenticator = "SNOWFLAKE";[\s\S]*this\.connectionOption\.useSSL = true;[\s\S]*this\.connectionOption\.connectTimeout = 5000;[\s\S]*this\.connectionOption\.requestTimeout = 10000;/);

assert.match(component, /Account/);
assert.match(component, /Warehouse/);
assert.match(component, /Authenticator/);
assert.match(component, /v-model="connectionOption\.account"/);
assert.match(component, /v-model="connectionOption\.warehouse"/);
assert.match(component, /v-model="connectionOption\.authenticator"/);

const logo = read("resources/icon/snowflake.svg");
assert.match(logo, /<svg/);
assert.match(logo, /Snowflake/);

console.log("snowflakeUiConfig tests passed");
