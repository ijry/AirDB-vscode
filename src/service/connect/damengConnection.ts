import { EventEmitter } from "events";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";
import { adaptDamengResult } from "./damengResultAdapter";

const dmdb = require("dmdb");

export class DamengConnection extends IConnection {
    private connection: any;
    private inTransaction = false;
    private readonly config: any;

    constructor(node: Node, private readonly driver: any = dmdb) {
        super();
        this.config = {
            host: node.host,
            port: node.port || 5236,
            user: node.user,
            password: node.password,
        };

        if (node.database) {
            this.config.schema = node.database;
        }
        if (node.connectTimeout) {
            this.config.connectTimeout = node.connectTimeout;
        }
    }

    isAlive(): boolean {
        return !this.dead && !!this.connection && this.connection.closed !== true;
    }

    connect(callback: (err: Error | null) => void): void {
        this.driver.getConnection(this.config)
            .then((connection) => {
                this.connection = connection;
                callback(null);
            })
            .catch((err) => {
                this.dead = true;
                callback(err);
            });
    }

    query(sql: string, callback?: queryCallback): EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): EventEmitter;
    query(sql: any, values?: any, callback?: any): EventEmitter {
        if (!callback && values instanceof Function) {
            callback = values;
            values = undefined;
        }

        const event = new EventEmitter();
        if (!this.connection) {
            const err = new Error("Dameng connection is not initialized");
            this.handleQueryError(event, err, callback);
            return event;
        }

        const executeOptions: any = {
            autoCommit: !this.inTransaction,
        };
        if (typeof this.driver.OUT_FORMAT_OBJECT !== "undefined") {
            executeOptions.outFormat = this.driver.OUT_FORMAT_OBJECT;
        }

        this.connection.execute(sql, typeof values === "undefined" ? [] : values, executeOptions)
            .then((result) => {
                const adapted = adaptDamengResult(result || {});
                if (callback) {
                    callback(null, adapted.results, adapted.fields);
                    return;
                }

                const rows = Array.isArray(adapted.results) ? adapted.results : [];
                if (rows.length == 0) {
                    event.emit("end");
                    return;
                }
                rows.forEach((row, index) => {
                    event.emit("result", this.convertToDump(row), rows.length == index + 1);
                });
            })
            .catch((err) => this.handleQueryError(event, err, callback));

        return event;
    }

    beginTransaction(callback: (err: Error | null) => void): void {
        this.inTransaction = true;
        callback(null);
    }

    async rollback() {
        if (!this.connection) {
            this.inTransaction = false;
            return;
        }
        try {
            await this.connection.rollback();
        } finally {
            this.inTransaction = false;
        }
    }

    async commit() {
        if (!this.connection) {
            this.inTransaction = false;
            return;
        }
        try {
            await this.connection.commit();
        } finally {
            this.inTransaction = false;
        }
    }

    end(): void {
        this.dead = true;
        if (!this.connection) {
            return;
        }
        const connection = this.connection;
        this.connection = null;
        try {
            connection.close().catch(() => undefined);
        } catch (err) {
        }
    }

    private handleQueryError(event: EventEmitter, err: Error, callback?: queryCallback): void {
        if (callback) {
            callback(err);
            if (event.listenerCount("error") > 0) {
                event.emit("error", err.message || err);
            }
            return;
        }
        event.emit("error", err.message || err);
    }
}
