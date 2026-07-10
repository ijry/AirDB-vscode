const assert = require("assert");
const fs = require("fs");
const path = require("path");

const connect = fs.readFileSync(path.resolve(__dirname, "../src/vue/connect/index.vue"), "utf8");
assert.match(connect, /Neo4j:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/neo4j\.svg"\)/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"Neo4j"/);
assert.match(connect, /\[[^\]]*'Neo4j'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /case "Neo4j":[\s\S]*this\.connectionOption\.user = "neo4j";[\s\S]*this\.connectionOption\.port = 7687;[\s\S]*this\.connectionOption\.database = "neo4j";[\s\S]*this\.connectionOption\.useSSL = false;[\s\S]*this\.connectionOption\.connectTimeout = 5000;[\s\S]*this\.connectionOption\.requestTimeout = 10000;/);

const icon = fs.readFileSync(path.resolve(__dirname, "../resources/icon/neo4j.svg"), "utf8");
assert.match(icon, /<svg/);
console.log("neo4jUiConfig tests passed");
