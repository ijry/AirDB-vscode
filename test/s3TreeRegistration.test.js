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
  "src/model/s3/s3BucketNode.ts",
  "src/model/s3/s3FolderNode.ts",
  "src/model/s3/s3ObjectNode.ts",
].forEach((relativePath) => {
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", relativePath)), `${relativePath} exists`);
});

const extension = read("src/extension.ts");
assert.match(extension, /S3BucketNode/);
assert.match(extension, /S3FolderNode/);
assert.match(extension, /S3ObjectNode/);
assert.match(extension, /"airdb\.s3\.object\.open"/);
assert.match(extension, /"airdb\.s3\.object\.download"/);
assert.match(extension, /"airdb\.s3\.object\.delete"/);
assert.match(extension, /"airdb\.s3\.object\.copy"/);
assert.match(extension, /"airdb\.s3\.object\.presign"/);
assert.match(extension, /"airdb\.s3\.object\.upload"/);
assert.match(extension, /"airdb\.s3\.folder\.new"/);

const pkgText = read("package.json");
assert.match(pkgText, /airdb\.s3\.object\.open/);
assert.match(pkgText, /airdb\.s3\.object\.download/);
assert.match(pkgText, /airdb\.s3\.object\.delete/);
assert.match(pkgText, /airdb\.s3\.object\.copy/);
assert.match(pkgText, /airdb\.s3\.object\.presign/);
assert.match(pkgText, /airdb\.s3\.object\.upload/);
assert.match(pkgText, /airdb\.s3\.folder\.new/);
assert.match(pkgText, /viewItem =~ \/\^\(s3Bucket\|s3Folder\)\$\//);
assert.match(pkgText, /viewItem == s3Object/);

const connectService = read("src/service/connect/connectService.ts");
assert.match(connectService, /node\.secretAccessKey/);
assert.match(connectService, /node\.sessionToken/);
const treeProviderSecret = read("src/provider/treeDataProvider.ts");
assert.match(treeProviderSecret, /decryptPassword\(node\.secretAccessKey/);
assert.match(treeProviderSecret, /decryptPassword\(node\.sessionToken/);

console.log("s3TreeRegistration tests passed");
