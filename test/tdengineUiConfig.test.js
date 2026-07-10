const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const vue = read("src/vue/connect/index.vue");
assert.match(vue, /TDengine/);
assert.match(vue, /resources\/icon\/tdengine\.svg/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.user = "root"/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.password = "taosdata"/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.port = 6041/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.database = ""/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.useSSL = false/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.connectTimeout = 5000/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.requestTimeout = 10000/);
assert.match(vue, /'TDengine'[\s\S]*\.includes\(connectionOption\.dbType\)/);

const iconPath = path.resolve(__dirname, "..", "resources/icon/tdengine.svg");
assert.ok(fs.existsSync(iconPath));
assert.match(fs.readFileSync(iconPath, "utf8"), /<svg/);

const schemaNode = read("src/model/database/schemaNode.ts");
assert.match(schemaNode, /DatabaseType\.TDENGINE/);

const tableGroup = read("src/model/main/tableGroup.ts");
assert.match(tableGroup, /DatabaseType\.TDENGINE/);

console.log("tdengineUiConfig tests passed");
