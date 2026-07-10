const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
assert.strictEqual(pkg.dependencies["@aws-sdk/client-s3"], "^3.1085.0");
assert.strictEqual(pkg.dependencies["@aws-sdk/s3-request-presigner"], "^3.1085.0");

const webpackConfig = read("webpack.config.js");
assert.match(webpackConfig, /'@aws-sdk\/client-s3':\s*'commonjs @aws-sdk\/client-s3'/);
assert.match(webpackConfig, /'@aws-sdk\/s3-request-presigner':\s*'commonjs @aws-sdk\/s3-request-presigner'/);

const vscodeIgnore = read(".vscodeignore");
assert.match(vscodeIgnore, /!node_modules\/@aws-sdk\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/@smithy\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/@aws-crypto\/\*\*/);

const constants = read("src/common/constants.ts");
assert.match(constants, /S3\s*=\s*"S3"/);
assert.match(constants, /S3_CONNECTION\s*=\s*"s3Connection"/);
assert.match(constants, /S3_BUCKET\s*=\s*"s3Bucket"/);
assert.match(constants, /S3_FOLDER\s*=\s*"s3Folder"/);
assert.match(constants, /S3_OBJECT\s*=\s*"s3Object"/);

const node = read("src/model/interface/node.ts");
assert.match(node, /public region\?: string/);
assert.match(node, /public endpoint\?: string/);
assert.match(node, /public accessKeyId\?: string/);
assert.match(node, /public secretAccessKey\?: string/);
assert.match(node, /public sessionToken\?: string/);
assert.match(node, /public bucket\?: string/);
assert.match(node, /public forcePathStyle\?: boolean/);
assert.match(node, /this\.dbType != DatabaseType\.S3/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /S3Connection/);
assert.match(connectionManager, /case DatabaseType\.S3:[\s\S]*new S3Connection/);

const treeProvider = read("src/provider/treeDataProvider.ts");
assert.match(treeProvider, /S3ConnectionNode/);
assert.match(treeProvider, /DatabaseType\.S3/);
assert.match(treeProvider, /new S3ConnectionNode/);
assert.match(treeProvider, /CacheKey\.NOSQL_CONNECTION/);

[
  "src/service/connect/s3Connection.ts",
  "src/model/s3/s3BaseNode.ts",
  "src/model/s3/s3ConnectionNode.ts",
].forEach((relativePath) => {
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", relativePath)), `${relativePath} exists`);
});

console.log("s3TreeRegistration tests passed");
