const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const constants = read("src/common/constants.ts");
assert.match(constants, /TDENGINE\s*=\s*"TDengine"/);

const pkg = JSON.parse(read("package.json"));
assert.strictEqual(pkg.dependencies["@tdengine/websocket"], "^3.5.0");

const webpackConfig = read("webpack.config.js");
assert.match(webpackConfig, /'@tdengine\/websocket':\s*'commonjs @tdengine\/websocket'/);

const vscodeIgnore = read(".vscodeignore");
assert.match(vscodeIgnore, /!node_modules\/@tdengine\//);
assert.match(vscodeIgnore, /!node_modules\/@tdengine\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/async-mutex\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/json-bigint\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/moment-timezone\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/uuid\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/websocket\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/bufferutil\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/es5-ext\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/es6-iterator\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/esniff\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/event-emitter\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/d\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/typedarray-to-buffer\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/utf-8-validate\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/yaeti\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/node-gyp-build\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/winston\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/winston-daily-rotate-file\/\*\*/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /TDengineConnection/);
assert.match(connectionManager, /case DatabaseType\.TDENGINE:[\s\S]*new TDengineConnection/);

const treeProvider = read("src/provider/treeDataProvider.ts");
const getKeyBlock = treeProvider.match(/private getKeyByNode[\s\S]*?return CacheKey\.DATBASE_CONECTIONS;/)[0];
assert.doesNotMatch(getKeyBlock, /DatabaseType\.TDENGINE/);

const connectionNode = read("src/model/database/connectionNode.ts");
assert.match(connectionNode, /icon\/tdengine\.svg/);
assert.match(connectionNode, /this\.dbType == DatabaseType\.TDENGINE[\s\S]*this\.iconPath/);
assert.match(connectionNode, /this\.dbType != DatabaseType\.TDENGINE[\s\S]*this\.contextValue == ModelType\.CONNECTION/);
assert.match(connectionNode, /DatabaseType\.TDENGINE\)[\s\S]*\? databaseNode\.schema[\s\S]*: databaseNode\.database/);

console.log("tdengineRegistration tests passed");
