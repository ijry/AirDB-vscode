const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.resolve(__dirname, "../src/vue/connect/index.vue"), "utf8");

assert.match(source, /KingbaseES:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/kingbase\.svg"\)[\s\S]*text:\s*"KB"/);
assert.match(source, /supportDatabases:\s*\[[\s\S]*"PostgreSQL"[\s\S]*"KingbaseES"/);
assert.match(source, /connectionOption\.dbType == 'KingbaseES'/);
assert.match(source, /\[[^\]]*'KingbaseES'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(
  source,
  /case "KingbaseES":[\s\S]*this\.connectionOption\.user = "system";[\s\S]*this\.connectionOption\.encrypt = false;[\s\S]*this\.connectionOption\.port = 54321;[\s\S]*this\.connectionOption\.database = "test";/
);

console.log("kingbaseUiConfig tests passed");
