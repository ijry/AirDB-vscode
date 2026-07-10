import EventEmitter = require("events");
import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListBucketsCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream, promises as fsPromises } from "fs";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";

export interface S3ClientLike {
    send(command: any): Promise<any>;
    destroy?(): void;
}

export type S3ClientFactory = (config: any) => S3ClientLike;
export type S3Presigner = (client: S3ClientLike, command: any, options: { expiresIn: number }) => Promise<string>;

export interface S3BucketSummary {
    name: string;
    creationDate?: Date;
}

export interface S3PrefixSummary {
    prefix: string;
    name: string;
}

export interface S3ObjectSummary {
    key: string;
    name: string;
    size: number;
    lastModified?: Date;
    etag?: string;
    storageClass?: string;
}

export interface S3ListResult {
    prefixes: S3PrefixSummary[];
    objects: S3ObjectSummary[];
}

export function normalizeS3Endpoint(node: Node | any): string | undefined {
    const endpoint = String(node.endpoint || "").trim();
    if (!endpoint) return undefined;
    if (/^https?:\/\//i.test(endpoint)) return endpoint.replace(/\/+$/, "");
    const scheme = node.useSSL === false ? "http" : "https";
    return `${scheme}://${endpoint.replace(/\/+$/, "")}`;
}

export function createS3ClientConfig(node: Node | any): any {
    const credentials = node.accessKeyId || node.secretAccessKey || node.sessionToken
        ? {
            accessKeyId: node.accessKeyId || "",
            secretAccessKey: node.secretAccessKey || "",
            sessionToken: node.sessionToken || undefined,
        }
        : undefined;
    return {
        region: node.region || "us-east-1",
        endpoint: normalizeS3Endpoint(node),
        forcePathStyle: !!node.forcePathStyle,
        credentials,
    };
}

export function formatS3Error(error: any): string {
    if (!error) return "Unknown S3 error";
    if (typeof error === "string") return error;

    const name = error.name || error.Code || error.code;
    const message = error.message || error.Message;
    if (name && message) return `${name}: ${message}`;
    return message || name || String(error);
}

export function buildS3CopySource(bucket: string, key: string): string {
    const encodedBucket = encodeURIComponent(bucket);
    const encodedKey = String(key || "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `/${encodedBucket}/${encodedKey}`;
}

async function streamToBuffer(body: any): Promise<Buffer> {
    if (!body) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof Uint8Array) return Buffer.from(body);
    if (typeof body === "string") return Buffer.from(body);
    if (typeof body.transformToByteArray === "function") {
        return Buffer.from(await body.transformToByteArray());
    }

    const chunks: Buffer[] = [];
    if (typeof body.on === "function") {
        return await new Promise<Buffer>((resolve, reject) => {
            body.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            body.on("error", reject);
            body.on("end", () => resolve(Buffer.concat(chunks)));
        });
    }

    if (body[Symbol.asyncIterator]) {
        for await (const chunk of body) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    return Buffer.from(String(body));
}

async function streamToFile(body: any, targetPath: string): Promise<void> {
    if (body && typeof body.pipe === "function") {
        await new Promise<void>((resolve, reject) => {
            const output = createWriteStream(targetPath);
            body.on("error", reject);
            output.on("error", reject);
            output.on("finish", resolve);
            body.pipe(output);
        });
        return;
    }
    await fsPromises.writeFile(targetPath, await streamToBuffer(body));
}

function displayNameFromPrefix(key: string, prefix: string): string {
    const withoutPrefix = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    const trimmed = withoutPrefix.replace(/\/$/, "");
    if (!trimmed) return key.replace(/\/$/, "");
    const segments = trimmed.split("/");
    return segments[segments.length - 1] || trimmed;
}

export class S3Connection extends IConnection {
    private client: S3ClientLike;
    private connected = false;

    constructor(
        private node: Node,
        private clientFactory: S3ClientFactory = (config) => new S3Client(config),
        private presigner: S3Presigner = getSignedUrl as S3Presigner
    ) {
        super();
        this.client = this.clientFactory(createS3ClientConfig(node));
    }

    public getClient(): S3ClientLike {
        return this.client;
    }

    query(_sql: string, callback?: queryCallback): void | EventEmitter;
    query(_sql: string, _values: any, callback?: queryCallback): void | EventEmitter;
    query(_sql: any, values?: any, callback?: any) {
        const cb = callback || (values instanceof Function ? values : null);
        if (cb) cb(new Error("S3 connection does not support SQL query."));
    }

    connect(callback: (err: Error) => void): void {
        this.client.send(new ListBucketsCommand({}))
            .then(() => {
                this.connected = true;
                callback(null);
            })
            .catch((error) => callback(new Error(`S3 connect failed: ${formatS3Error(error)}`)));
    }

    beginTransaction(callback: (err: Error) => void): void {
        callback(new Error("S3 connection does not support transactions."));
    }

    rollback(): void {
    }

    commit(): void {
    }

    end(): void {
        this.connected = false;
        if (this.client.destroy) this.client.destroy();
    }

    isAlive(): boolean {
        return this.connected;
    }

    public async listBuckets(): Promise<S3BucketSummary[]> {
        const result = await this.client.send(new ListBucketsCommand({}));
        return (result.Buckets || [])
            .filter((bucket) => bucket && bucket.Name)
            .map((bucket) => ({
                name: bucket.Name,
                creationDate: bucket.CreationDate,
            }));
    }

    public async listObjects(bucket: string, prefix: string = ""): Promise<S3ListResult> {
        const prefixes: S3PrefixSummary[] = [];
        const objects: S3ObjectSummary[] = [];
        let continuationToken: string | undefined;

        do {
            const result = await this.client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                Delimiter: "/",
                ContinuationToken: continuationToken,
            }));

            for (const item of result.CommonPrefixes || []) {
                if (!item.Prefix) continue;
                prefixes.push({
                    prefix: item.Prefix,
                    name: displayNameFromPrefix(item.Prefix, prefix),
                });
            }

            for (const item of result.Contents || []) {
                const key = item.Key || "";
                if (!key || key === prefix) continue;
                objects.push({
                    key,
                    name: displayNameFromPrefix(key, prefix),
                    size: item.Size || 0,
                    lastModified: item.LastModified,
                    etag: item.ETag,
                    storageClass: item.StorageClass,
                });
            }

            continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
        } while (continuationToken);

        return { prefixes, objects };
    }

    public async uploadObject(bucket: string, key: string, filePath: string): Promise<void> {
        await this.client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: createReadStream(filePath),
        }));
    }

    public async downloadObject(bucket: string, key: string, targetPath: string): Promise<void> {
        const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        await streamToFile(result.Body, targetPath);
    }

    public async getObjectBuffer(bucket: string, key: string, maxBytes: number): Promise<Buffer> {
        const head = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        if (head.ContentLength != null && head.ContentLength > maxBytes) {
            throw new Error(`S3 object is larger than ${maxBytes} bytes.`);
        }

        const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const buffer = await streamToBuffer(result.Body);
        if (buffer.length > maxBytes) {
            throw new Error(`S3 object is larger than ${maxBytes} bytes.`);
        }
        return buffer;
    }

    public async deleteObject(bucket: string, key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }

    public async copyObject(bucket: string, sourceKey: string, targetKey: string, targetBucket: string = bucket): Promise<void> {
        await this.client.send(new CopyObjectCommand({
            Bucket: targetBucket,
            Key: targetKey,
            CopySource: buildS3CopySource(bucket, sourceKey),
        }));
    }

    public async createFolder(bucket: string, prefix: string): Promise<void> {
        const folderKey = prefix.endsWith("/") ? prefix : `${prefix}/`;
        await this.client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: folderKey,
            Body: "",
        }));
    }

    public async createPresignedGetUrl(bucket: string, key: string, expiresIn: number): Promise<string> {
        return await this.presigner(
            this.client,
            new GetObjectCommand({ Bucket: bucket, Key: key }),
            { expiresIn }
        );
    }
}
