import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";
import { adaptOracleResult } from "./oracleResultAdapter";

const oracledb = require("oracledb");

export class OracleConnection extends IConnection {
    private connection: any;
    private inTransaction = false;
    private readonly connectionConfig: any;
    private readonly requestTimeout: number;

    constructor(node: Node) {
        super();
        const port = node.port || 1521;
        const serviceName = node.database || "";
        const connectString = serviceName ? `${node.host}:${port}/${serviceName}` : `${node.host}:${port}`;

        this.requestTimeout = node.requestTimeout || 10000;
        this.connectionConfig = {
            user: node.user,
            password: node.password,
            connectString,
        };

        if (node.connectTimeout) {
            const timeoutSeconds = Math.max(1, Math.ceil(Number(node.connectTimeout) / 1000));
            this.connectionConfig.connectTimeout = timeoutSeconds;
            this.connectionConfig.transportConnectTimeout = timeoutSeconds;
        }
    }

    isAlive(): boolean {
        return !this.dead && !!this.connection;
    }

    connect(callback: (err: Error) => void): void {
        oracledb.getConnection(this.connectionConfig)
            .then((connection) => {
                this.connection = connection;
                if (this.requestTimeout) {
                    this.connection.callTimeout = this.requestTimeout;
                }
                callback(null);
            })
            .catch((err) => {
                this.dead = true;
                callback(err);
            });
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
            values = {};
        }

        const event = new EventEmitter();
        const binds = values && !(values instanceof Function) ? values : {};

        if (!this.connection) {
            const err = new Error("Oracle connection is not initialized");
            if (callback) {
                callback(err);
            }
            process.nextTick(() => event.emit("error", err.message));
            return event;
        }

        this.connection.execute(sql, binds, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: !this.inTransaction,
        }).then((result) => {
            const adapted = adaptOracleResult(result);

            if (!callback) {
                const rows = Array.isArray(adapted.results) ? adapted.results : [];
                if (rows.length == 0) {
                    event.emit("end");
                    return;
                }
                rows.forEach((row, index) => {
                    event.emit("result", this.convertToDump(row), rows.length == index + 1);
                });
                return;
            }

            callback(null, adapted.results, adapted.fields);
        }).catch((err) => {
            if (this.isFatalError(err)) {
                this.dead = true;
            }
            if (callback) {
                callback(err);
            }
            event.emit("error", err.message || err);
        });

        return event;
    }

    beginTransaction(callback: (err: Error) => void): void {
        this.inTransaction = true;
        callback(null);
    }

    rollback(): void {
        if (!this.connection) {
            this.inTransaction = false;
            return;
        }
        this.connection.rollback()
            .catch(() => {
                this.dead = true;
            })
            .finally(() => {
                this.inTransaction = false;
            });
    }

    commit(): void {
        if (!this.connection) {
            this.inTransaction = false;
            return;
        }
        this.connection.commit()
            .catch(() => {
                this.dead = true;
            })
            .finally(() => {
                this.inTransaction = false;
            });
    }

    end(): void {
        this.dead = true;
        if (!this.connection) {
            return;
        }
        this.connection.close().catch(() => undefined);
        this.connection = null;
    }

    private isFatalError(err: any): boolean {
        const errorNum = err?.errorNum;
        return errorNum == 28 || errorNum == 3113 || errorNum == 3114 || errorNum == 3135 || errorNum == 1012;
    }
}
