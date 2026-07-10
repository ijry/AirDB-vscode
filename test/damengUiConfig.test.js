const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { root } = require("./testSetup");

const source = fs.readFileSync(path.resolve(root, "src/vue/connect/index.vue"), "utf8");

assert.match(source, /Dameng:\s*\{\s*text:\s*"DM"/);
assert.match(source, /supportDatabases:\s*\[[\s\S]*"KingbaseES",\s*"Dameng"/);
assert.match(source, /case "Dameng":[\s\S]*this\.connectionOption\.user = "SYSDBA";[\s\S]*this\.connectionOption\.encrypt = false;[\s\S]*this\.connectionOption\.port = 5236;[\s\S]*this\.connectionOption\.database = "SYSDBA";/);

console.log("damengUiConfig tests passed");
