import EventEmitter = require("events");
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";

export interface S3ClientLike {
    send(command: any): Promise<any>;
    destroy?(): void;
}

export type S3ClientFactory = (config: any) => S3ClientLike;
export type S3Presigner = (client: S3ClientLike, command: any, options: { expiresIn: number }) => Promise<string>;

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
        this.connected = true;
        callback(null);
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
}
