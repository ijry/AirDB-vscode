const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const connect = read("src/vue/connect/index.vue");
assert.match(connect, /import S3 from "\.\/component\/S3\.vue"/);
assert.match(connect, /components: \{[\s\S]*S3/);
assert.match(connect, /S3:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/s3\.svg"\)/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"S3"/);
assert.match(connect, /<S3\s+v-else-if="connectionOption\.dbType == 'S3'"/);
assert.match(connect, /connectionOption\.dbType == 'S3'/);
assert.match(connect, /case "S3":[\s\S]*this\.connectionOption\.region = "us-east-1";[\s\S]*this\.connectionOption\.forcePathStyle = false;[\s\S]*this\.connectionOption\.requestTimeout = 30000;/);
assert.match(connect, /\[[^\]]*'S3'[^\]]*\]\.includes\(connectionOption\.dbType\)/);

const component = read("src/vue/connect/component/S3.vue");
assert.match(component, /Region/);
assert.match(component, /Endpoint/);
assert.match(component, /Default Bucket/);
assert.match(component, /Access Key ID/);
assert.match(component, /Secret Access Key/);
assert.match(component, /Session Token/);
assert.match(component, /Path-style/);
assert.match(component, /connectionOption\.accessKeyId/);
assert.match(component, /connectionOption\.secretAccessKey/);
assert.match(component, /connectionOption\.forcePathStyle/);

const icon = read("resources/icon/s3.svg");
assert.match(icon, /<svg/);
assert.match(icon, /S3/);

console.log("s3UiConfig tests passed");
