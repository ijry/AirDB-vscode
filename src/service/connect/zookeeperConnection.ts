import EventEmitter = require("events");
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";

const zookeeper = require("node-zookeeper-client");

export interface ZooKeeperConfig {
    connectionString: string;
    rootPath: string;
    authScheme: string;
    authValue: string;
    connectTimeout: number;
    requestTimeout: number;
}

export type ZooKeeperClientFactory = (connectionString: string, options: any) => any;

function parseNumber(value: any, defaultValue: number): number {
    const parsed = parseInt(String(value == null || value === "" ? defaultValue : value), 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function normalizeZooKeeperPath(path: string): string {
    const normalized = String(path || "/")
        .trim()
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/");
    const withRoot = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return withRoot.length > 1 ? withRoot.replace(/\/+$/, "") : "/";
}

export function joinZooKeeperPath(parentPath: string, childName: string): string {
    const child = String(childName || "").replace(/^\/+|\/+$/g, "");
    if (!child) return normalizeZooKeeperPath(parentPath);
    return normalizeZooKeeperPath(`${normalizeZooKeeperPath(parentPath)}/${child}`);
}

function createConnectionString(node: Node | any, port: number): string {
    const connectionUrl = String(node.connectionUrl || "").trim();
    if (connectionUrl) return connectionUrl;

    const hostSource = String(node.host || "127.0.0.1");
    return hostSource
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean)
        .map((host) => host.includes(":") ? host : `${host}:${port}`)
        .join(",");
}

export function createZooKeeperConfig(node: Node | any): ZooKeeperConfig {
    const port = parseNumber(node.port, 2181);
    const user = node.user || "";
    const password = node.password || "";
    return {
        connectionString: createConnectionString(node, port),
        rootPath: normalizeZooKeeperPath(node.database || "/"),
        authScheme: node.zookeeperAuthScheme || "digest",
        authValue: user || password ? `${user}:${password}` : "",
        connectTimeout: parseNumber(node.connectTimeout, 5000),
        requestTimeout: parseNumber(node.requestTimeout, 10000),
    };
}

export class ZooKeeperConnection extends IConnection {
    private readonly config: ZooKeeperConfig;
    private readonly client: any;
    private connected = false;

    constructor(
        private node: Node,
        private clientFactory: ZooKeeperClientFactory = (connectionString, options) => zookeeper.createClient(connectionString, options)
    ) {
        super();
        this.config = createZooKeeperConfig(node);
        this.client = this.clientFactory(this.config.connectionString, {
            sessionTimeout: this.config.connectTimeout,
            spinDelay: 1000,
            retries: 0,
        });
        if (this.config.authValue) {
            this.client.addAuthInfo(this.config.authScheme, Buffer.from(this.config.authValue));
        }
        this.client.on("disconnected", () => {
            this.connected = false;
        });
        this.client.on("expired", () => {
            this.connected = false;
        });
    }

    query(_sql: string, callback?: queryCallback): void | EventEmitter;
    query(_sql: string, _values: any, callback?: queryCallback): void | EventEmitter;
    query(_sql: any, values?: any, callback?: any): void | EventEmitter {
        const cb = callback || (values instanceof Function ? values : null);
        if (cb) cb(new Error("ZooKeeper connection does not support SQL query."));
    }

    connect(callback: (err: Error) => void): void {
        let completed = false;
        let timer: NodeJS.Timeout;

        const finish = (error?: Error) => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            this.client.removeListener("connected", onConnected);
            this.client.removeListener("connectedReadOnly", onConnected);
            this.client.removeListener("authenticationFailed", onAuthFailed);
            this.client.removeListener("expired", onExpired);
            if (error) {
                this.connected = false;
                callback(error);
                return;
            }
            this.connected = true;
            callback(null);
        };

        const onConnected = () => finish();
        const onAuthFailed = () => finish(new Error("ZooKeeper authentication failed."));
        const onExpired = () => finish(new Error("ZooKeeper session expired."));

        timer = setTimeout(() => {
            try {
                this.client.close();
            } catch (_error) {
            }
            finish(new Error(`ZooKeeper connect timeout after ${this.config.connectTimeout} ms.`));
        }, this.config.connectTimeout);

        this.client.once("connected", onConnected);
        this.client.once("connectedReadOnly", onConnected);
        this.client.once("authenticationFailed", onAuthFailed);
        this.client.once("expired", onExpired);
        this.client.connect();
    }

    beginTransaction(callback: (err: Error) => void): void {
        callback(new Error("ZooKeeper connection does not support transactions."));
    }

    rollback(): void {
    }

    commit(): void {
    }

    end(): void {
        this.connected = false;
        if (this.client) this.client.close();
    }

    isAlive(): boolean {
        return this.connected;
    }

    getRootPath(): string {
        return this.config.rootPath;
    }

    listChildren(path: string): Promise<string[]> {
        return this.withRequestTimeout<string[]>((resolve, reject) => {
            this.client.getChildren(normalizeZooKeeperPath(path), (error, children) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(children || []);
            });
        });
    }

    getData(path: string): Promise<Buffer> {
        return this.withRequestTimeout<Buffer>((resolve, reject) => {
            this.client.getData(normalizeZooKeeperPath(path), (error, data) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(Buffer.isBuffer(data) ? data : Buffer.from(data || ""));
            });
        });
    }

    getStat(path: string): Promise<any> {
        return this.withRequestTimeout<any>((resolve, reject) => {
            this.client.exists(normalizeZooKeeperPath(path), (error, stat) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stat);
            });
        });
    }

    private withRequestTimeout<T>(runner: (resolve: (value: T) => void, reject: (error: any) => void) => void): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let completed = false;
            const timer = setTimeout(() => {
                if (completed) return;
                completed = true;
                reject(new Error(`ZooKeeper request timeout after ${this.config.requestTimeout} ms.`));
            }, this.config.requestTimeout);

            const done = (value: T) => {
                if (completed) return;
                completed = true;
                clearTimeout(timer);
                resolve(value);
            };
            const fail = (error: any) => {
                if (completed) return;
                completed = true;
                clearTimeout(timer);
                reject(error);
            };

            try {
                runner(done, fail);
            } catch (error) {
                fail(error);
            }
        });
    }
}
