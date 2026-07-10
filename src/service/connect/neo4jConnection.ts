import EventEmitter = require("events");
import { FieldInfo } from "@/common/typeDef";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";

export interface Neo4jConfig {
    uri: string;
    user: string;
    password: string;
    database: string;
    connectTimeout: number;
    requestTimeout: number;
    encrypted: boolean;
}

export type Neo4jDriverFactory = (uri: string, auth: any, options: any) => any;

const DATABASE_CYPHER = "SHOW DATABASES YIELD name RETURN name ORDER BY name";
const LABEL_CYPHER = "CALL db.labels() YIELD label RETURN label ORDER BY label";
const RELATIONSHIP_CYPHER = "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType";

function parseNumber(value: any, defaultValue: number): number {
    const parsed = parseInt(String(value == null || value === "" ? defaultValue : value));
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function defaultDriverFactory(uri: string, auth: any, options: any): any {
    const neo4j = require("neo4j-driver");
    return neo4j.driver(uri, auth, options);
}

function defaultAuthProvider(): any {
    return require("neo4j-driver").auth;
}

export function createNeo4jConfig(node: Node | any): Neo4jConfig {
    const host = node.host || "127.0.0.1";
    const port = parseNumber(node.port, 7687);
    const encrypted = !!node.useSSL;
    const uri = String(node.connectionUrl || "").trim() || `${encrypted ? "bolt+s" : "bolt"}://${host}:${port}`;
    return {
        uri,
        user: node.user || "neo4j",
        password: node.password || "",
        database: node.database || "neo4j",
        connectTimeout: parseNumber(node.connectTimeout, 5000),
        requestTimeout: parseNumber(node.requestTimeout, 10000),
        encrypted,
    };
}

function isNeo4jInteger(value: any): boolean {
    return value
        && typeof value === "object"
        && typeof value.toNumber === "function"
        && (typeof value.inSafeRange === "function" || Object.prototype.hasOwnProperty.call(value, "low"));
}

function serializeInteger(value: any): number | string {
    if (typeof value.inSafeRange === "function" && !value.inSafeRange()) {
        return value.toString();
    }
    const numberValue = value.toNumber();
    if (Number.isSafeInteger(numberValue)) {
        return numberValue;
    }
    return value.toString();
}

function isNeo4jNode(value: any): boolean {
    return value
        && typeof value === "object"
        && Array.isArray(value.labels)
        && value.properties
        && Object.prototype.hasOwnProperty.call(value, "identity");
}

function isNeo4jRelationship(value: any): boolean {
    return value
        && typeof value === "object"
        && typeof value.type === "string"
        && value.properties
        && Object.prototype.hasOwnProperty.call(value, "identity")
        && Object.prototype.hasOwnProperty.call(value, "start")
        && Object.prototype.hasOwnProperty.call(value, "end");
}

function isNeo4jPath(value: any): boolean {
    return value
        && typeof value === "object"
        && Array.isArray(value.segments)
        && Object.prototype.hasOwnProperty.call(value, "start")
        && Object.prototype.hasOwnProperty.call(value, "end");
}

function isDriverObjectWithString(value: any): boolean {
    if (!value || typeof value !== "object" || typeof value.toString !== "function") return false;
    if (Array.isArray(value) || value instanceof Date || value instanceof Map) return false;
    return value.constructor && value.constructor !== Object && value.toString !== Object.prototype.toString;
}

export function serializeNeo4jValue(value: any): any {
    if (value == null) return value;
    if (isNeo4jInteger(value)) return serializeInteger(value);
    if (Array.isArray(value)) return value.map((item) => serializeNeo4jValue(item));
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Map) {
        const result = {};
        value.forEach((item, key) => {
            result[String(key)] = serializeNeo4jValue(item);
        });
        return result;
    }
    if (isNeo4jPath(value)) {
        return {
            start: serializeNeo4jValue(value.start),
            end: serializeNeo4jValue(value.end),
            segments: serializeNeo4jValue(value.segments),
        };
    }
    if (isNeo4jRelationship(value)) {
        return {
            identity: serializeNeo4jValue(value.identity),
            type: value.type,
            start: serializeNeo4jValue(value.start),
            end: serializeNeo4jValue(value.end),
            properties: serializeNeo4jValue(value.properties || {}),
            elementId: value.elementId,
            startNodeElementId: value.startNodeElementId,
            endNodeElementId: value.endNodeElementId,
        };
    }
    if (isNeo4jNode(value)) {
        return {
            identity: serializeNeo4jValue(value.identity),
            labels: serializeNeo4jValue(value.labels || []),
            properties: serializeNeo4jValue(value.properties || {}),
            elementId: value.elementId,
        };
    }
    if (isDriverObjectWithString(value)) return value.toString();
    if (typeof value === "object") {
        const result = {};
        for (const key of Object.keys(value)) {
            result[key] = serializeNeo4jValue(value[key]);
        }
        return result;
    }
    return value;
}

function recordToRow(record: any): any {
    if (record && typeof record.toObject === "function") {
        return serializeNeo4jValue(record.toObject());
    }
    const row = {};
    for (const key of record?.keys || []) {
        row[key] = serializeNeo4jValue(record.get(key));
    }
    return row;
}

function createFields(rows: any[]): FieldInfo[] {
    const names: string[] = [];
    for (const row of rows) {
        for (const key of Object.keys(row || {})) {
            if (!names.includes(key)) names.push(key);
        }
    }
    return names.map((name) => ({
        name,
        orgName: name,
        table: "",
        orgTable: "",
        db: "",
        schema: "",
        catalog: "",
        charsetNr: 0,
        length: 0,
        flags: 0,
        decimals: 0,
        zeroFill: false,
        protocol41: true,
        nullable: "YES",
        type: "text",
    } as any));
}

function firstValue(row: any): any {
    const key = Object.keys(row || {})[0];
    return key == null ? null : row[key];
}

export class Neo4jConnection extends IConnection {
    private config: Neo4jConfig;
    private driver: any;
    private connected = false;

    constructor(
        private node: Node,
        private driverFactory: Neo4jDriverFactory = defaultDriverFactory,
        private authProvider: any = defaultAuthProvider()
    ) {
        super();
        this.config = createNeo4jConfig(node);
        this.driver = this.driverFactory(this.config.uri, this.authProvider.basic(this.config.user, this.config.password || ""), {
            connectionAcquisitionTimeout: this.config.connectTimeout,
            maxTransactionRetryTime: this.config.requestTimeout,
        });
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any): void | EventEmitter {
        const cb = callback || (values instanceof Function ? values : null);
        const params = cb === values ? undefined : values;

        if (cb) {
            this.executeRows(String(sql), params)
                .then((rows) => cb(null, rows, createFields(rows), rows.length))
                .catch((error) => cb(error));
            return;
        }

        const emitter = new EventEmitter();
        this.executeRows(String(sql), params)
            .then((rows) => {
                rows.forEach((row, index) => emitter.emit("result", row, index === rows.length - 1));
                emitter.emit("end");
            })
            .catch((error) => emitter.emit("error", error));
        return emitter;
    }

    connect(callback: (err: Error) => void): void {
        this.driver.verifyConnectivity()
            .then(() => {
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
        this.connected = false;
        if (this.driver && typeof this.driver.close === "function") {
            this.driver.close().catch(() => {});
        }
    }

    isAlive(): boolean {
        return this.connected;
    }

    async listDatabases(): Promise<string[]> {
        try {
            return await this.listFirstColumn(DATABASE_CYPHER);
        } catch (_error) {
            return [this.config.database];
        }
    }

    async listLabels(database?: string): Promise<string[]> {
        return await this.listFirstColumn(LABEL_CYPHER, database);
    }

    async listRelationshipTypes(database?: string): Promise<string[]> {
        return await this.listFirstColumn(RELATIONSHIP_CYPHER, database);
    }

    private async listFirstColumn(cypher: string, database?: string): Promise<string[]> {
        const rows = await this.executeRows(cypher, undefined, database);
        return rows
            .map((row) => firstValue(row))
            .filter((value) => value != null && value !== "")
            .map((value) => String(value))
            .sort((a, b) => a.localeCompare(b));
    }

    private async executeRows(cypher: string, params?: any, database?: string): Promise<any[]> {
        const session = this.driver.session({ database: database || this.config.database });
        try {
            const result = await session.run(cypher, params || {});
            return (result.records || []).map((record) => recordToRow(record));
        } finally {
            if (session && typeof session.close === "function") {
                await session.close();
            }
        }
    }
}
