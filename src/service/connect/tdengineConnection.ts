import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";

type TDengineClientFactory = (config: any) => any;

interface TDengineQueryResult {
    rows: any[];
    fields: any[];
    affectedRows?: number;
    raw?: any;
}

function parseNumber(value: any, defaultValue: number): number {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseBoolean(value: any, defaultValue: boolean): boolean {
    if (value == null || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    return String(value).toLowerCase() === "true";
}

function buildTDengineUrl(node: Node | any): string {
    if (node.connectionUrl) return node.connectionUrl;
    const protocol = node.useSSL ? "wss" : "ws";
    return `${protocol}://${node.host}:${node.port}`;
}

function buildTDengineDsn(node: Node | any): string {
    if (node.connectionUrl) return node.connectionUrl;
    const protocol = node.useSSL ? "wss" : "ws";
    const user = encodeURIComponent(node.user || "root");
    const password = encodeURIComponent(node.password || "taosdata");
    return `${protocol}://${user}:${password}@${node.host}:${node.port}`;
}

function createDefaultTDengineClient(config: any): any {
    const tdengine = require("@tdengine/websocket");
    if (!(tdengine.WSConfig instanceof Function) || !(tdengine.sqlConnect instanceof Function)) {
        throw new Error("@tdengine/websocket does not expose WSConfig/sqlConnect.");
    }

    const wsConfig = new tdengine.WSConfig(config.dsn);
    wsConfig.setUser(config.user);
    wsConfig.setPwd(config.password);
    if (config.database) {
        wsConfig.setDb(config.database);
    }
    if (config.requestTimeout) {
        wsConfig.setTimeOut(config.requestTimeout);
    }
    return tdengine.sqlConnect(wsConfig);
}

export function createTDengineConfig(node: Node | any): any {
    const normalized = TDengineConnection.normalizeNode(node);
    return {
        url: buildTDengineUrl(normalized),
        dsn: buildTDengineDsn(normalized),
        host: normalized.host,
        port: normalized.port,
        user: normalized.user,
        username: normalized.user,
        password: normalized.password,
        database: normalized.database || "",
        db: normalized.database || "",
        connectTimeout: normalized.connectTimeout,
        requestTimeout: normalized.requestTimeout,
        timeout: normalized.requestTimeout,
    };
}

function fieldsFromMeta(meta: any[] | null | undefined): any[] {
    if (!Array.isArray(meta)) return [];
    return meta.map((field, index) => ({
        name: field?.name || field?.columnName || field?.colName || `column_${index + 1}`,
        nullable: "YES",
    }));
}

function fieldsFromRows(rows: any[]): any[] {
    const first = rows && rows[0];
    if (!first) return [];
    return Object.keys(first).map((name) => ({ name, nullable: "YES" }));
}

function rowFromArray(values: any[], meta: any[] | null | undefined): any {
    const fields = fieldsFromMeta(meta);
    if (fields.length === 0) return values;
    return values.reduce((row, value, index) => {
        row[fields[index]?.name || `column_${index + 1}`] = value;
        return row;
    }, {});
}

function rowFromData(data: any, meta: any[] | null | undefined): any {
    if (Array.isArray(data)) return rowFromArray(data, meta);
    return data;
}

function rowsFromData(data: any, meta: any[] | null | undefined): any[] {
    if (!data) return [];
    if (!Array.isArray(data)) return [data];
    if (data.length === 0) return [];
    if (Array.isArray(data[0])) {
        return data.map((row) => rowFromArray(row, meta));
    }
    return [rowFromData(data, meta)];
}

async function rowsFromWSRows(wsRows: any): Promise<TDengineQueryResult> {
    const meta = wsRows?.getMeta instanceof Function ? wsRows.getMeta() : [];
    const rows: any[] = [];
    try {
        while (await wsRows.next()) {
            rows.push(rowFromData(wsRows.getData(), meta));
        }
    } finally {
        if (wsRows?.close instanceof Function) {
            await wsRows.close();
        }
    }
    return { rows, fields: fieldsFromMeta(meta), raw: wsRows };
}

async function adaptResult(result: any): Promise<TDengineQueryResult> {
    if (result?.next instanceof Function && result?.getData instanceof Function) {
        return rowsFromWSRows(result);
    }

    if (result?.getData instanceof Function) {
        const meta = result.getMeta instanceof Function ? result.getMeta() : [];
        const rows = rowsFromData(result.getData(), meta);
        const affectedRows = result.getAffectRows instanceof Function ? result.getAffectRows() : undefined;
        return { rows, fields: fieldsFromMeta(meta), affectedRows, raw: result };
    }

    if (Array.isArray(result)) {
        return { rows: result, fields: fieldsFromRows(result), raw: result };
    }

    const rows = Array.isArray(result?.rows)
        ? result.rows
        : (Array.isArray(result?.data) ? result.data : (Array.isArray(result?.result) ? result.result : []));
    const affectedRows = result?.affectedRows ?? result?.affected ?? result?.rowsAffected;
    return { rows, fields: fieldsFromRows(rows), affectedRows, raw: result };
}

function shouldUseRowsQuery(sql: string): boolean {
    return /^\s*(select|with)\b/i.test(sql);
}

export class TDengineConnection extends IConnection {
    public client: any;
    private connected = false;
    private requestId = 1;

    constructor(private node: Node, private clientFactory: TDengineClientFactory = createDefaultTDengineClient) {
        super();
    }

    public static normalizeNode(node: Node | any): any {
        return {
            ...node,
            host: node.host || "127.0.0.1",
            port: parseNumber(node.port, 6041),
            user: node.user || "root",
            password: node.password || "taosdata",
            database: node.database || "",
            useSSL: parseBoolean(node.useSSL, false),
            connectTimeout: parseNumber(node.connectTimeout, 5000),
            requestTimeout: parseNumber(node.requestTimeout, 10000),
        };
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values?: any, callback?: any): void | EventEmitter {
        if (!callback && values instanceof Function) {
            callback = values;
        }

        const event = new EventEmitter();
        this.runQuery(sql).then((result) => {
            if (!callback) {
                if (result.rows.length === 0) {
                    event.emit("end");
                    return;
                }
                result.rows.forEach((row, index) => event.emit("result", this.convertToDump(row), result.rows.length === index + 1));
                return;
            }

            const rows = result.rows.length > 0
                ? result.rows
                : (result.affectedRows != null ? { affectedRows: result.affectedRows } : []);
            callback(null, rows, result.fields);
        }).catch((error) => {
            if (callback) {
                callback(error);
                return;
            }
            event.emit("error", error.message || String(error));
        });
        return callback ? undefined : event;
    }

    private async ensureClient(): Promise<any> {
        if (!this.client) {
            this.client = await Promise.resolve(this.clientFactory(createTDengineConfig(this.node)));
        }
        return this.client;
    }

    private async runQuery(sql: string): Promise<TDengineQueryResult> {
        const client = await this.ensureClient();
        const reqId = this.requestId++;

        if (shouldUseRowsQuery(sql) && client.query instanceof Function) {
            return adaptResult(await client.query(sql, reqId));
        }
        if (client.exec instanceof Function) {
            return adaptResult(await client.exec(sql, reqId));
        }
        if (client.query instanceof Function) {
            return adaptResult(await client.query(sql, reqId));
        }
        if (client.execute instanceof Function) {
            return adaptResult(await client.execute(sql, reqId));
        }
        throw new Error("TDengine client does not expose query, exec, or execute.");
    }

    connect(callback: (err: Error) => void): void {
        Promise.resolve()
            .then(async () => {
                await this.ensureClient();
                await this.runQuery("SELECT 1");
                this.dead = false;
                this.connected = true;
                callback(null);
            })
            .catch((error) => callback(error));
    }

    beginTransaction(callback: (err: Error) => void): void {
        callback(null);
    }

    rollback(): void {
    }

    commit(): void {
    }

    end(): void {
        this.dead = true;
        this.connected = false;
        try {
            if (this.client?.close instanceof Function) {
                this.client.close();
            }
        } catch (_error) {
        }
    }

    isAlive(): boolean {
        return !this.dead && this.connected;
    }
}
