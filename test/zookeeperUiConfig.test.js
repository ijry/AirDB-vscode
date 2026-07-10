const assert = require("assert");
const fs = require("fs");
const path = require("path");

const connect = fs.readFileSync(path.resolve(__dirname, "../src/vue/connect/index.vue"), "utf8");

assert.match(connect, /ZooKeeper:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/zookeeper\.svg"\)/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"ZooKeeper"/);
assert.match(connect, /connectionOption\.dbType != 'SSH' && connectionOption\.dbType != 'SQLite' && connectionOption\.dbType != 'DuckDB' && connectionOption\.dbType != 'S3'/);
assert.match(connect, /case "ZooKeeper":[\s\S]*this\.connectionOption\.user = "";[\s\S]*this\.connectionOption\.password = "";[\s\S]*this\.connectionOption\.port = 2181;[\s\S]*this\.connectionOption\.database = "\/";[\s\S]*this\.connectionOption\.useSSL = false;[\s\S]*this\.connectionOption\.connectTimeout = 5000;[\s\S]*this\.connectionOption\.requestTimeout = 10000;/);

const icon = fs.readFileSync(path.resolve(__dirname, "../resources/icon/zookeeper.svg"), "utf8");
assert.match(icon, /<svg/);

console.log("zookeeperUiConfig tests passed");
