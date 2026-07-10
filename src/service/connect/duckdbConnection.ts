import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import * as vscode from "vscode";
import { IConnection, queryCallback } from "./connection";

type DuckDbFactory = (path: string) => any;
type DuckDbModule = { Database: new (path: string) => any };

function createDuckDbDatabase(dbPath: string): any {
    const duckdb = require("duckdb") as DuckDbModule;
    return new duckdb.Database(dbPath);
}

function fieldsFromRows(rows: any[]): any[] {
    const first = rows && rows[0];
    if (!first) return [];
    return Object.keys(first).map((name) => ({ name, nullable: "YES" }));
}

export class DuckDBConnection extends IConnection {
    private db: any;
    private connection: any;
    private connected = false;

    constructor(private node: Node, private databaseFactory: DuckDbFactory = createDuckDbDatabase) {
        super();
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
        }
        const event = new EventEmitter();
        this.connection.all(sql, (error: Error, rows: any[]) => {
            if (error) {
                if (callback) callback(error);
                event.emit("error", error.message || String(error));
                return;
            }
            rows = rows || [];
            if (!callback) {
                if (rows.length === 0) {
                    event.emit("end");
                }
                rows.forEach((row, index) => event.emit("result", this.convertToDump(row), rows.length === index + 1));
                return;
            }
            callback(null, rows, fieldsFromRows(rows));
        });
        return event;
    }

    connect(callback: (err: Error) => void): void {
        if (!this.node.dbPath) {
            callback(new Error(vscode.l10n.t("DuckDB db path cannot be null!")));
            return;
        }
        try {
            this.db = this.databaseFactory(this.node.dbPath);
            this.connection = this.db.connect();
            this.connected = true;
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    beginTransaction(callback: (err: Error) => void): void {
        callback(null);
    }

    rollback(): void {
        if (this.connection) this.connection.run("ROLLBACK");
    }

    commit(): void {
        if (this.connection) this.connection.run("COMMIT");
    }

    end(): void {
        this.connected = false;
        if (this.connection && this.connection.close) this.connection.close();
        if (this.db && this.db.close) this.db.close();
    }

    isAlive(): boolean {
        return this.connected;
    }
}
