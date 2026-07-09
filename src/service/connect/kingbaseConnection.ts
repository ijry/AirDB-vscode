import * as fs from "fs";
import { EventEmitter } from "events";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";
import { loadKingbaseDriver } from "./kingbaseDriverLoader";

export interface KingbaseClientLike {
    connect(callback: (err: Error | null) => void): void;
    query(sql: any, callback: (err: Error | null, res: any) => void): any;
    query(sql: any, values: any, callback: (err: Error | null, res: any) => void): any;
    end(callback?: (err?: Error) => void): any;
    on(event: string, listener: (...args: any[]) => void): any;
}

export interface KingbaseDriverLike {
    Client: new (config: any) => KingbaseClientLike;
}

export class KingbaseConnection extends IConnection {
    private client: KingbaseClientLike;

    constructor(node: Node, driver: KingbaseDriverLike = loadKingbaseDriver()) {
        super();
        const config: any = {
            host: node.host,
            port: node.port || 54321,
            user: node.user,
            password: node.password,
            database: node.database,
            connectionTimeoutMillis: node.connectTimeout || 5000,
            statement_timeout: node.requestTimeout || 10000,
        };
        if (node.useSSL) {
            config.ssl = {
                rejectUnauthorized: false,
                ca: node.caPath ? fs.readFileSync(node.caPath) : null,
                cert: node.clientCertPath ? fs.readFileSync(node.clientCertPath) : null,
                key: node.clientKeyPath ? fs.readFileSync(node.clientKeyPath) : null,
            };
        }
        this.client = new driver.Client(config);
    }

    isAlive(): boolean {
        const client = this.client as any;
        if (this.dead) {
            return false;
        }
        if (typeof client._connected === "boolean") {
            return client._connected && !client._ending && client._queryable !== false;
        }
        return !client._ending;
    }

    query(sql: string, callback?: queryCallback): EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): EventEmitter;
    query(sql: any, values?: any, callback?: any): EventEmitter {
        if (!callback && values instanceof Function) {
            callback = values;
            values = undefined;
        }

        const event = new EventEmitter();
        const handler = (err: Error | null, res: any) => {
            if (err) {
                if (callback) {
                    callback(err);
                    if (event.listenerCount("error") > 0) {
                        event.emit("error", err.message);
                    }
                } else {
                    event.emit("error", err.message);
                }
                this.end();
                return;
            }

            if (!callback) {
                const rows = res?.rows || [];
                if (rows.length === 0) {
                    event.emit("end");
                }
                for (let i = 1; i <= rows.length; i++) {
                    event.emit("result", this.convertToDump(rows[i - 1]), rows.length === i);
                }
                return;
            }

            if (res instanceof Array) {
                callback(null, res.map((row) => this.adaptResult(row)), res.map((row) => row.fields || []));
            } else {
                callback(null, this.adaptResult(res), res?.fields || []);
            }
        };

        if (typeof values !== "undefined") {
            this.client.query(sql, values, handler);
        } else {
            this.client.query(sql, handler);
        }
        return event;
    }

    adaptResult(res: any) {
        if (!res) {
            return [];
        }
        const command = String(res.command || "").toUpperCase();
        if (command && command !== "SELECT" && command !== "SHOW") {
            return { affectedRows: res.rowCount || 0 };
        }
        return res.rows || [];
    }

    connect(callback: (err: Error | null) => void): void {
        this.client.connect((err) => {
            callback(err);
            if (!err) {
                this.client.on("error", () => this.end());
                this.client.on("end", () => this.end());
            }
        });
    }

    async beginTransaction(callback: (err: Error | null) => void) {
        this.client.query("BEGIN", callback);
    }

    async rollback() {
        await new Promise<void>((resolve, reject) => {
            this.client.query("ROLLBACK", (err) => (err ? reject(err) : resolve()));
        });
    }

    async commit() {
        await new Promise<void>((resolve, reject) => {
            this.client.query("COMMIT", (err) => (err ? reject(err) : resolve()));
        });
    }

    end(): void {
        if (this.dead) {
            return;
        }
        this.dead = true;
        try {
            this.client.end();
        } catch (err) {
        }
    }
}
