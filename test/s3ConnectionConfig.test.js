const assert = require("assert");
const { requireTs } = require("./testSetup");

const {
  buildS3CopySource,
  createS3ClientConfig,
  formatS3Error,
  normalizeS3Endpoint,
} = requireTs("src/service/connect/s3Connection.ts");

assert.strictEqual(normalizeS3Endpoint({ endpoint: "minio.local:9000", useSSL: false }), "http://minio.local:9000");
assert.strictEqual(normalizeS3Endpoint({ endpoint: "https://s3.example.com/" }), "https://s3.example.com");
assert.strictEqual(normalizeS3Endpoint({ endpoint: "" }), undefined);

assert.deepStrictEqual(createS3ClientConfig({
  region: "ap-southeast-1",
  endpoint: "minio.local:9000",
  useSSL: false,
  forcePathStyle: true,
  accessKeyId: "ak",
  secretAccessKey: "sk",
  sessionToken: "token",
}), {
  region: "ap-southeast-1",
  endpoint: "http://minio.local:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: "ak",
    secretAccessKey: "sk",
    sessionToken: "token",
  },
});

assert.deepStrictEqual(createS3ClientConfig({}), {
  region: "us-east-1",
  endpoint: undefined,
  forcePathStyle: false,
  credentials: undefined,
});

assert.strictEqual(buildS3CopySource("bucket name", "folder/a b#1.txt"), "/bucket%20name/folder/a%20b%231.txt");
assert.strictEqual(formatS3Error({ name: "AccessDenied", message: "denied" }), "AccessDenied: denied");
assert.strictEqual(formatS3Error({ message: "network down" }), "network down");
assert.strictEqual(formatS3Error("plain error"), "plain error");

console.log("s3ConnectionConfig tests passed");
