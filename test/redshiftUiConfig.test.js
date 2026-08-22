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
// Redshift must reach the SSL panel. Asserted by membership rather than by pinning
// the whole list: the previous exact-list match broke every time a database type
// was added (TDengine and Neo4j both did), which is not what this test is about.
const sslPanelList = connect.match(
  /<SSL[\s\S]*?\[([^\]]*)\]\.includes\(connectionOption\.dbType\)/
);
assert.ok(sslPanelList, "the SSL panel should gate on a dbType list");
assert.match(sslPanelList[1], /'Redshift'/, "Redshift should be able to show the SSL panel");
assert.match(connect, /case "Redshift":[\s\S]*this\.connectionOption\.user = "awsuser";[\s\S]*this\.connectionOption\.password = "";[\s\S]*this\.connectionOption\.port = 5439;[\s\S]*this\.connectionOption\.database = "dev";[\s\S]*this\.connectionOption\.useSSL = true;[\s\S]*this\.connectionOption\.connectTimeout = 5000;[\s\S]*this\.connectionOption\.requestTimeout = 10000;/);

const logo = read("resources/icon/redshift.svg");
assert.match(logo, /<svg/);
assert.match(logo, /Redshift/);

console.log("redshiftUiConfig tests passed");
