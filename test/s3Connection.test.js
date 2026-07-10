const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const { requireTs } = require("./testSetup");

const { S3Connection } = requireTs("src/service/connect/s3Connection.ts");

function createFakeClient() {
  const calls = [];

  return {
    calls,
    client: {
      send: async (command) => {
        const name = command.constructor.name;
        calls.push({ name, input: command.input });

        switch (calls.length) {
          case 1:
            assert.strictEqual(name, "ListBucketsCommand");
            return { Buckets: [] };
          case 2:
            assert.strictEqual(name, "ListBucketsCommand");
            return {
              Buckets: [
                { Name: "bucket-a", CreationDate: new Date("2026-01-01T00:00:00.000Z") },
                { Name: "" },
              ],
            };
          case 3:
            assert.strictEqual(name, "ListObjectsV2Command");
            assert.deepStrictEqual(command.input, {
              Bucket: "bucket-a",
              Prefix: "folder/",
              Delimiter: "/",
              ContinuationToken: undefined,
            });
            return {
              CommonPrefixes: [{ Prefix: "folder/sub/" }],
              Contents: [
                { Key: "", Size: 10 },
                { Key: "folder/", Size: 0 },
                {
                  Key: "folder/a.txt",
                  Size: 12,
                  LastModified: new Date("2026-01-02T00:00:00.000Z"),
                  ETag: "\"etag\"",
                  StorageClass: "STANDARD",
                },
              ],
            };
          case 4:
            assert.strictEqual(name, "PutObjectCommand");
            assert.strictEqual(command.input.Bucket, "bucket-a");
            assert.strictEqual(command.input.Key, "upload.txt");
            assert.ok(command.input.Body);
            await new Promise((resolve) => {
              command.input.Body.on("close", resolve);
              command.input.Body.destroy();
            });
            return {};
          case 5:
            assert.strictEqual(name, "GetObjectCommand");
            assert.deepStrictEqual(command.input, { Bucket: "bucket-a", Key: "folder/a.txt" });
            return { Body: Readable.from(["downloaded"]) };
          case 6:
            assert.strictEqual(name, "HeadObjectCommand");
            assert.deepStrictEqual(command.input, { Bucket: "bucket-a", Key: "folder/a.txt" });
            return { ContentLength: 5 };
          case 7:
            assert.strictEqual(name, "GetObjectCommand");
            assert.deepStrictEqual(command.input, { Bucket: "bucket-a", Key: "folder/a.txt" });
            return { Body: Readable.from([Buffer.from("hello")]) };
          case 8:
            assert.strictEqual(name, "DeleteObjectCommand");
            assert.deepStrictEqual(command.input, { Bucket: "bucket-a", Key: "folder/a.txt" });
            return {};
          case 9:
            assert.strictEqual(name, "CopyObjectCommand");
            assert.deepStrictEqual(command.input, {
              Bucket: "bucket-b",
              Key: "folder/b copy.txt",
              CopySource: "/bucket-a/folder/a.txt",
            });
            return {};
          case 10:
            assert.strictEqual(name, "PutObjectCommand");
            assert.deepStrictEqual(command.input, {
              Bucket: "bucket-a",
              Key: "folder/new/",
              Body: "",
            });
            return {};
          default:
            throw new Error(`Unexpected command ${calls.length}: ${name}`);
        }
      },
      destroy: () => calls.push({ name: "destroy" }),
    },
  };
}

(async () => {
  const fake = createFakeClient();
  const presignCalls = [];
  const connection = new S3Connection(
    {
      dbType: "S3",
      region: "ap-southeast-1",
      endpoint: "minio.local:9000",
      useSSL: false,
      forcePathStyle: true,
      accessKeyId: "ak",
      secretAccessKey: "sk",
    },
    () => fake.client,
    async (_client, command, options) => {
      presignCalls.push({ name: command.constructor.name, input: command.input, options });
      return "https://signed.example.com/folder/a.txt";
    }
  );

  await new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()));
  });
  assert.strictEqual(connection.isAlive(), true);

  const buckets = await connection.listBuckets();
  assert.deepStrictEqual(buckets.map((bucket) => bucket.name), ["bucket-a"]);

  const listed = await connection.listObjects("bucket-a", "folder/");
  assert.deepStrictEqual(listed.prefixes, [{ prefix: "folder/sub/", name: "sub" }]);
  assert.strictEqual(listed.objects.length, 1);
  assert.strictEqual(listed.objects[0].key, "folder/a.txt");
  assert.strictEqual(listed.objects[0].name, "a.txt");
  assert.strictEqual(listed.objects[0].size, 12);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "airdb-s3-"));
  const uploadPath = path.join(tempDir, "upload.txt");
  const downloadPath = path.join(tempDir, "download.txt");
  fs.writeFileSync(uploadPath, "upload-body");

  await connection.uploadObject("bucket-a", "upload.txt", uploadPath);
  await connection.downloadObject("bucket-a", "folder/a.txt", downloadPath);
  assert.strictEqual(fs.readFileSync(downloadPath, "utf8"), "downloaded");

  const buffer = await connection.getObjectBuffer("bucket-a", "folder/a.txt", 10);
  assert.strictEqual(buffer.toString("utf8"), "hello");

  await connection.deleteObject("bucket-a", "folder/a.txt");
  await connection.copyObject("bucket-a", "folder/a.txt", "folder/b copy.txt", "bucket-b");
  await connection.createFolder("bucket-a", "folder/new");

  const url = await connection.createPresignedGetUrl("bucket-a", "folder/a.txt", 3600);
  assert.strictEqual(url, "https://signed.example.com/folder/a.txt");
  assert.deepStrictEqual(presignCalls, [{
    name: "GetObjectCommand",
    input: { Bucket: "bucket-a", Key: "folder/a.txt" },
    options: { expiresIn: 3600 },
  }]);

  assert.deepStrictEqual(
    fake.calls.filter((call) => call.name !== "destroy").map((call) => call.name),
    [
      "ListBucketsCommand",
      "ListBucketsCommand",
      "ListObjectsV2Command",
      "PutObjectCommand",
      "GetObjectCommand",
      "HeadObjectCommand",
      "GetObjectCommand",
      "DeleteObjectCommand",
      "CopyObjectCommand",
      "PutObjectCommand",
    ]
  );

  connection.end();
  assert.strictEqual(connection.isAlive(), false);
  assert.strictEqual(fake.calls[fake.calls.length - 1].name, "destroy");

  const largeConnection = new S3Connection(
    { dbType: "S3" },
    () => ({
      send: async (command) => {
        assert.strictEqual(command.constructor.name, "HeadObjectCommand");
        return { ContentLength: 11 };
      },
    })
  );
  await assert.rejects(
    () => largeConnection.getObjectBuffer("bucket-a", "large.bin", 10),
    /larger than 10 bytes/
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log("s3Connection tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
