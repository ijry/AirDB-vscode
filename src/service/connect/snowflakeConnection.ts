import { Node } from "@/model/interface/node";
import * as snowflake from "snowflake-sdk";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";

type SnowflakeStatement = snowflake.RowStatement | snowflake.FileAndStageBindStatement;

export class SnowflakeConnection extends IConnection {
    private client: snowflake.Connection;
    private connected = false;

    constructor(node: Node) {
        super();
        const normalized = SnowflakeConnection.normalizeNode(node);
        const options: snowflake.ConnectionOptions = {
            account: normalized.account || normalized.host,
            host: node.account && node.host ? node.host : undefined,
            username: normalized.user,
            password: normalized.password,
            database: normalized.database || undefined,
            schema: normalized.schema || "PUBLIC",
            warehouse: normalized.warehouse || undefined,
            role: normalized.role || undefined,
            authenticator: normalized.authenticator || "SNOWFLAKE",
            application: "AirDB",
            clientSessionKeepAlive: true,
            timeout: normalized.requestTimeout || normalized.connectTimeout || 10000,
        };
        this.client = this.createClient(options);
    }

    protected createClient(options: snowflake.ConnectionOptions): snowflake.Connection {
        return snowflake.createConnection(options);
    }

    public static normalizeNode(node: Node): Node {
        return {
            ...node,
            account: node.account || node.host || "",
            port: node.port || 443,
            schema: node.schema || "PUBLIC",
            authenticator: node.authenticator || "SNOWFLAKE",
            useSSL: node.useSSL == null ? true : node.useSSL,
            connectTimeout: node.connectTimeout || 5000,
            requestTimeout: node.requestTimeout || 10000,
        } as Node;
    }

    isAlive(): boolean {
        try {
            return !this.dead && this.connected && this.client.isUp();
        } catch (_error) {
            return false;
        }
    }

    query(sql: string, callback?: queryCallback): EventEmitter | void;
    query(sql: string, values: any, callback?: queryCallback): EventEmitter | void;
    query(sql: string, values?: any, callback?: any): EventEmitter | void {
        if (!callback && values instanceof Function) {
            callback = values;
            values = undefined;
        }

        const event = new EventEmitter();
        const options: snowflake.StatementOption = {
            sqlText: sql,
            binds: values,
            complete: (err, statement, rows) => {
                if (err) {
                    if (callback) {
                        callback(err);
                    } else {
                        event.emit("error", err.message || err);
                    }
                    return;
                }

                const resultRows = rows || [];
                if (!callback) {
                    if (resultRows.length == 0) {
                        event.emit("end");
                    }
                    for (let i = 1; i <= resultRows.length; i++) {
                        const row = resultRows[i - 1];
                        event.emit("result", this.convertToDump(row), resultRows.length == i);
                    }
                    return;
                }

                callback(null, this.adaptResult(statement, resultRows));
            },
        };

        this.client.execute(options);
        return callback ? undefined : event;
    }

    private adaptResult(statement: SnowflakeStatement, rows: any[]) {
        if (rows && rows.length > 0) {
            return rows;
        }
        const affectedRows = (statement as any)?.getNumRowsAffected instanceof Function
            ? (statement as any).getNumRowsAffected()
            : ((statement as any)?.getNumRows instanceof Function ? (statement as any).getNumRows() : 0);
        return { affectedRows };
    }

    connect(callback: (err: Error) => void): void {
        this.client.connect((err) => {
            this.connected = !err;
            callback(err as Error);
        });
    }

    async beginTransaction(callback: (err: Error) => void) {
        this.query("BEGIN", callback);
    }

    async rollback() {
        this.query("ROLLBACK", () => undefined);
    }

    async commit() {
        this.query("COMMIT", () => undefined);
    }

    end(): void {
        this.dead = true;
        this.connected = false;
        try {
            this.client.destroy(() => undefined);
        } catch (_error) {
        }
    }
}
