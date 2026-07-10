# Amazon S3 Support Design

## Goal

Add Amazon S3 support to AirDB as a NoSQL/object-storage connection type. The first version supports AWS S3 and S3-compatible services with bucket browsing, object browsing, upload, download, delete, folder placeholder creation, object copy, and presigned URL generation.

## Scope

S3 support includes:

- An `S3` database type in the connection page and NoSQL tree.
- AWS S3 and S3-compatible endpoints such as MinIO, Aliyun OSS S3-compatible endpoints, and Tencent COS S3-compatible endpoints.
- Region, endpoint, access key, secret key, optional session token, SSL, and path-style addressing configuration.
- Bucket listing when no default bucket is configured.
- Optional default bucket mode that opens a single bucket directly.
- Prefix-based folder browsing with delimiter `/`.
- Object upload, download, delete, copy, and open-small-object behavior.
- Folder creation by writing a zero-byte object ending in `/`.
- Presigned URL generation for object download.

S3 support does not include in the first version:

- IAM, bucket policy, ACL, CORS, lifecycle, replication, inventory, or encryption management.
- Object versioning UI.
- Multipart upload resume UI or detailed transfer queue management.
- Bulk delete across many selected objects.
- S3 Select, Glacier restore, object lock, or retention controls.
- SQL query integration or table/result-grid integration.

## Dependency

Use the AWS SDK for JavaScript v3:

- `@aws-sdk/client-s3@3.1085.0`
- `@aws-sdk/s3-request-presigner@3.1085.0`

The versions were checked with `npm view @aws-sdk/client-s3 version` and `npm view @aws-sdk/s3-request-presigner version` on 2026-07-11.

Primary references:

- AWS SDK for JavaScript S3 examples: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html
- AWS SDK for JavaScript v3 package docs: https://github.com/aws/aws-sdk-js-v3
- `@aws-sdk/client-s3` package: https://www.npmjs.com/package/@aws-sdk/client-s3
- `@aws-sdk/s3-request-presigner` package: https://www.npmjs.com/package/@aws-sdk/s3-request-presigner

## Architecture

S3 is modeled as a NoSQL/object-storage connection, similar to FTP for file-like tree behavior and RabbitMQ/Kafka for dedicated non-SQL connection operations. It uses `CacheKey.NOSQL_CONNECTION`, appears in `activitybar.airdb.nosql`, and does not participate in SQL dialect, page service, import service, dump service, active database, or query workspace flows.

The connection layer provides a focused `S3Connection` wrapper around `S3Client`. It exposes typed methods for listing buckets, listing prefix contents, uploading objects, downloading objects, deleting objects, copying objects, creating folder placeholders, and generating presigned URLs. Tree nodes call these methods directly instead of routing S3 operations through SQL query strings.

The tree mirrors object storage shape:

```text
S3 connection
  bucket
    folder/
      object.txt
```

If the connection has a default bucket, the root node can open that bucket directly. If no default bucket is configured, expanding the connection lists buckets.

## Components

### Connection UI

Add S3 to `src/vue/connect/index.vue` with an S3 logo and defaults:

- `dbType`: `S3`
- `host`: empty or derived from endpoint for display
- `region`: `us-east-1`
- `endpoint`: empty
- `accessKeyId`: empty
- `secretAccessKey`: empty
- `sessionToken`: empty
- `bucket`: empty
- `useSSL`: `true`
- `forcePathStyle`: `false`
- `connectTimeout`: `5000`
- `requestTimeout`: `30000`

Create `src/vue/connect/component/S3.vue` for:

- Region input.
- Endpoint input for S3-compatible services.
- Bucket input for optional default bucket.
- Access key ID.
- Secret access key.
- Optional session token.
- `Use SSL` toggle through the existing connection option.
- `Path-style` toggle for MinIO and many S3-compatible deployments.

Saved connection fields use the existing flexible `Node` shape:

- `region?: string`
- `endpoint?: string`
- `accessKeyId?: string`
- `secretAccessKey?: string`
- `sessionToken?: string`
- `bucket?: string`
- `forcePathStyle?: boolean`

### Connection Model

Add:

- `DatabaseType.S3 = "S3"`
- `ModelType.S3_CONNECTION`
- `ModelType.S3_BUCKET`
- `ModelType.S3_FOLDER`
- `ModelType.S3_OBJECT`

S3 nodes live under `src/model/s3/`:

- `s3BaseNode.ts`: shared helper to fetch `S3Connection`.
- `s3ConnectionNode.ts`: root node for one S3 connection.
- `s3BucketNode.ts`: one bucket, loads top-level prefixes and objects.
- `s3FolderNode.ts`: one prefix ending in `/`, loads nested prefixes and objects.
- `s3ObjectNode.ts`: one object, supports open, download, delete, copy, and presigned URL.

### Connection Service

Create `src/service/connect/s3Connection.ts`.

Responsibilities:

- Build an `S3Client` from `Node`.
- Use explicit credentials from the connection form.
- Support `endpoint`, `region`, `forcePathStyle`, and `useSSL`.
- Validate connection by listing buckets or listing the configured bucket prefix.
- Expose:
  - `listBuckets(): Promise<S3BucketSummary[]>`
  - `listObjects(bucket: string, prefix?: string): Promise<S3ListResult>`
  - `uploadObject(bucket: string, key: string, filePath: string): Promise<void>`
  - `downloadObject(bucket: string, key: string, targetPath: string): Promise<void>`
  - `getObjectBuffer(bucket: string, key: string, maxBytes: number): Promise<Buffer>`
  - `deleteObject(bucket: string, key: string): Promise<void>`
  - `copyObject(bucket: string, sourceKey: string, targetKey: string, targetBucket?: string): Promise<void>`
  - `createFolder(bucket: string, prefix: string): Promise<void>`
  - `createPresignedGetUrl(bucket: string, key: string, expiresIn: number): Promise<string>`
  - `end(): void`
  - `isAlive(): boolean`
- Return meaningful errors for AWS SDK service exceptions and network failures.

S3 does not support SQL query, transactions, rollback, or commit. `query()` returns an error through the callback when called accidentally.

### Tree Data Flow

`DbTreeDataProvider.getKeyByNode()` stores S3 in `CacheKey.NOSQL_CONNECTION`.

`DbTreeDataProvider.getNode()` creates `S3ConnectionNode` when `dbType == DatabaseType.S3`.

`S3ConnectionNode.getChildren()`:

- If `bucket` is configured, returns a single `S3BucketNode`.
- Otherwise calls `S3Connection.listBuckets()` and returns one `S3BucketNode` per bucket.

`S3BucketNode.getChildren()` and `S3FolderNode.getChildren()` call `listObjects()` with delimiter `/` semantics. Common prefixes become `S3FolderNode`; object summaries become `S3ObjectNode`. Folders sort before objects, and both sort by name.

Tree node labels:

- Connection: configured name, endpoint, or `S3`.
- Bucket: bucket name.
- Folder: final path segment with trailing `/`.
- Object: final key segment.

Object descriptions show human-readable size and last-modified time when available.

### Object Operations

Upload:

- Available on bucket and folder nodes.
- Uses `vscode.window.showOpenDialog`.
- Target key is current prefix plus local file basename.
- Refreshes the parent node after success.

Download:

- Available on object nodes.
- Uses `vscode.window.showSaveDialog`.
- Streams object content to disk.

Open:

- Available on object nodes.
- Downloads to the existing temp file area and opens in VS Code.
- Refuses objects larger than 10 MiB for consistency with FTP open behavior.
- Blocks archive and binary extensions already blocked by FTP where applicable.

Delete:

- Available on object and folder nodes.
- Object delete calls `DeleteObjectCommand`.
- Folder delete removes the folder placeholder object only in the first version, not all nested objects.

New folder:

- Available on bucket and folder nodes.
- Prompts for a folder name.
- Creates a zero-byte object with key ending in `/`.

Copy object:

- Available on object nodes.
- Prompts for target key, and optionally target bucket.
- Defaults target bucket to the current bucket.

Presigned URL:

- Available on object nodes.
- Prompts for expiry seconds, default `3600`.
- Calls `getSignedUrl()` for `GetObjectCommand`.
- Copies the URL to clipboard and shows a success notification.

## Error Handling

Connection errors display in the connection page through the existing `connect.errorMessage` flow.

Tree metadata errors return an `InfoNode` with the operation name and message, for example `List buckets failed: AccessDenied`.

Object operation errors use `vscode.window.showErrorMessage()` and include the operation name:

- `Upload object failed`
- `Download object failed`
- `Delete object failed`
- `Copy object failed`
- `Create folder failed`
- `Create presigned URL failed`

AWS SDK errors can carry `$metadata`, `name`, and `message`. The user-facing formatter should prefer `name: message`, then `message`, then `String(error)`.

## Testing

Add focused tests:

- `test/s3ConnectionConfig.test.js`: validates S3 client config mapping for region, endpoint, credentials, session token, SSL endpoint normalization, and path-style mode.
- `test/s3Connection.test.js`: uses a fake S3 client to test list buckets, list objects, upload, download, delete, copy, create folder, presign plumbing, and unsupported SQL query behavior.
- `test/s3TreeRegistration.test.js`: verifies `DatabaseType.S3`, NoSQL routing, `S3ConnectionNode`, `ConnectionManager` registration, and package command/menu registration.
- `test/s3UiConfig.test.js`: verifies S3 logo, support list, defaults, component registration, SSL/path-style UI, and credential inputs.

Run nearby regression tests for multi-backend registration and NoSQL UI where available, plus `npm run build`.

## Packaging

AWS SDK v3 packages are bundled through webpack as normal npm dependencies. No external AWS CLI is required.

Because AWS SDK v3 can pull in Node HTTP and checksum modules, the implementation should keep imports focused:

- Import only the needed S3 commands from `@aws-sdk/client-s3`.
- Import only `getSignedUrl` from `@aws-sdk/s3-request-presigner`.
- Do not add `@aws-sdk/lib-storage` in the first version unless direct stream upload proves insufficient.

## Manual Verification

Before release, verify against:

- AWS S3 with region-only endpoint.
- MinIO with custom endpoint and `forcePathStyle = true`.
- A connection with a default bucket.
- A connection without a default bucket.
- Bucket listing.
- Prefix/folder browsing.
- Upload a small text file.
- Open the uploaded file in VS Code.
- Download the uploaded file.
- Copy the uploaded file to a new key.
- Generate a presigned URL and open it in a browser.
- Delete copied and uploaded objects.
- Create a folder placeholder.
- Confirm S3 appears in the NoSQL tree, not the SQL tree.

