import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { createClient } from "@clickhouse/client";
import { IConnection, queryCallback } from "./connection";

type ClickHouseFactory = (config: any) => any;

function buildUrl(node: Node | any): string {
    if (node.connectionUrl) return node.connectionUrl;
    const protocol = node.scheme || (node.useSSL ? "https" : "http");
    const host = node.host || "127.0.0.1";
    const port = node.port || (node.useSSL ? 8443 : 8123);
    return `${protocol}://${host}:${port}`;
}

export function createClickHouseConfig(node: Node | any): any {
    const config: any = {
        url: buildUrl(node),
        username: node.user || "default",
        password: node.password || "",
        database: node.database || "default",
        request_timeout: parseInt(node.requestTimeout || 30000),
        clickhouse_settings: {},
    };
    return config;
}

function fieldsFromRows(rows: any[]): any[] {
    const first = rows && rows[0];
    if (!first) return [];
    return Object.keys(first).map((name) => ({ name, nullable: "YES" }));
}

export class ClickHouseConnection extends IConnection {
    private client: any;
    private connected = false;

    constructor(private node: Node, private clientFactory: ClickHouseFactory = createClient) {
        super();
        this.client = clientFactory(createClickHouseConfig(node));
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        const event = new EventEmitter();
        this.runQuery(sql).then((rows) => {
            if (!callback) {
                if (rows.length === 0) {
                    event.emit("end");
                }
                rows.forEach((row, index) => event.emit("result", this.convertToDump(row), rows.length === index + 1));
                return;
            }
            callback(null, rows, fieldsFromRows(rows));
        }).catch((error) => {
            if (callback) callback(error);
            event.emit("error", error.message || String(error));
        });
        return event;
    }

    private async runQuery(sql: string): Promise<any[]> {
        const result = await this.client.query({
            query: sql,
            format: "JSONEachRow",
        });
        const rows = await result.json();
        return Array.isArray(rows) ? rows : [];
    }

    connect(callback: (err: Error) => void): void {
        this.client.ping()
            .then((result) => {
                if (result && result.success === false) {
                    callback(result.error || new Error("ClickHouse ping failed."));
                    return;
                }
                this.connected = true;
                callback(null);
            })
            .catch((error) => callback(error));
    }

    beginTransaction(callback: (err: Error) => void): void {
        callback(new Error("ClickHouse connection does not support transactions."));
    }

    rollback(): void {
    }

    commit(): void {
    }

    end(): void {
        this.connected = false;
        if (this.client && this.client.close) {
            this.client.close();
        }
    }

    isAlive(): boolean {
        return this.connected;
    }
}
