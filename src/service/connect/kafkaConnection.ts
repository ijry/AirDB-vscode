import { Node } from "@/model/interface/node";
import * as fs from "fs";
import { Kafka, KafkaConfig, logLevel } from "kafkajs";
import { IConnection, queryCallback } from "./connection";

export type KafkaAuthMode = "none" | "plain" | "scram-sha-256" | "scram-sha-512";
export type KafkaReadStartMode = "beginning" | "latest" | "offset";

export interface KafkaReadOptions {
    topic: string;
    partition?: number;
    startMode: KafkaReadStartMode;
    offset?: string | number;
    limit?: number;
    timeoutMs?: number;
}

export interface KafkaMessageRow {
    topic: string;
    partition: number;
    offset: string;
    timestamp: string;
    key: string;
    value: string;
    headers: { [key: string]: string };
}

export interface KafkaSendOptions {
    topic: string;
    partition?: number;
    key?: string;
    value: string;
    headers?: { [key: string]: string };
}

type KafkaFactory = (config: KafkaConfig) => any;

function bufferToText(value: Buffer | string | null | undefined): string {
    if (value == null) return "";
    if (Buffer.isBuffer(value)) return value.toString("utf8");
    return String(value);
}

function normalizeHeaders(headers: any): { [key: string]: string } {
    const result = {};
    for (const key of Object.keys(headers || {})) {
        result[key] = bufferToText(headers[key]);
    }
    return result;
}

export function normalizeKafkaBrokers(node: { brokers?: string; host?: string; port?: number | string }): string[] {
    const source = node.brokers || node.host || "127.0.0.1:9092";
    return String(source)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
            if (item.includes(":")) return item;
            return `${item}:${node.port || 9092}`;
        });
}

export function createKafkaConfig(node: Node | any): KafkaConfig {
    const config: KafkaConfig = {
        clientId: node.clientId || "airdb",
        brokers: normalizeKafkaBrokers(node),
        logLevel: logLevel.ERROR,
        connectionTimeout: parseInt(node.connectTimeout || 5000),
        requestTimeout: parseInt(node.requestTimeout || 30000),
    };

    if (node.useSSL) {
        if (node.caPath || node.clientCertPath || node.clientKeyPath) {
            config.ssl = {
                rejectUnauthorized: false,
                ca: node.caPath ? [fs.readFileSync(node.caPath, "utf8")] : undefined,
                cert: node.clientCertPath ? fs.readFileSync(node.clientCertPath, "utf8") : undefined,
                key: node.clientKeyPath ? fs.readFileSync(node.clientKeyPath, "utf8") : undefined,
            };
        } else {
            config.ssl = true;
        }
    }

    if (node.kafkaAuth && node.kafkaAuth !== "none") {
        config.sasl = {
            mechanism: node.kafkaAuth,
            username: node.user || "",
            password: node.password || "",
        } as any;
    }

    return config;
}

export class KafkaConnection extends IConnection {
    private connected = false;
    private kafka: any;

    constructor(private node: Node, private kafkaFactory: KafkaFactory = (config) => new Kafka(config)) {
        super();
        this.kafka = kafkaFactory(createKafkaConfig(node));
    }

    query(_sql: string, callback?: queryCallback): void;
    query(_sql: string, _values: any, callback?: queryCallback): void;
    query(_sql: any, values?: any, callback?: any) {
        const cb = callback || (values instanceof Function ? values : null);
        if (cb) cb(new Error("Kafka connection does not support SQL query."));
    }

    async getAdmin(): Promise<any> {
        const admin = this.kafka.admin();
        await admin.connect();
        return admin;
    }

    async withAdmin<T>(runner: (admin: any) => Promise<T>): Promise<T> {
        const admin = await this.getAdmin();
        try {
            return await runner(admin);
        } finally {
            await admin.disconnect();
        }
    }

    async listTopics(): Promise<string[]> {
        return this.withAdmin((admin) => admin.listTopics());
    }

    async describeTopics(topics?: string[]): Promise<any> {
        return this.withAdmin((admin) => admin.fetchTopicMetadata(topics ? { topics } : undefined));
    }

    async fetchTopicOffsets(topic: string): Promise<any[]> {
        return this.withAdmin((admin) => admin.fetchTopicOffsets(topic));
    }

    async listConsumerGroups(): Promise<any[]> {
        return this.withAdmin(async (admin) => {
            const result = await admin.listGroups();
            return result.groups || [];
        });
    }

    async describeConsumerGroups(groupIds: string[]): Promise<any> {
        return this.withAdmin((admin) => admin.describeGroups(groupIds));
    }

    async fetchConsumerGroupOffsets(groupId: string, topics?: string[]): Promise<any> {
        return this.withAdmin((admin) => admin.fetchOffsets({ groupId, topics }));
    }

    async readMessages(options: KafkaReadOptions): Promise<KafkaMessageRow[]> {
        const limit = Math.max(1, parseInt(String(options.limit || 100)));
        const timeoutMs = Math.max(500, parseInt(String(options.timeoutMs || 8000)));
        const groupId = `airdb-preview-${Date.now()}-${Math.round(Math.random() * 100000)}`;
        const consumer = this.kafka.consumer({ groupId });
        const messages: KafkaMessageRow[] = [];
        let completed = false;
        let timer: NodeJS.Timeout;

        const finish = async (resolve: (rows: KafkaMessageRow[]) => void) => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            try {
                await consumer.disconnect();
            } finally {
                resolve(messages);
            }
        };

        return new Promise<KafkaMessageRow[]>(async (resolve, reject) => {
            try {
                await consumer.connect();
                await consumer.subscribe({
                    topic: options.topic,
                    fromBeginning: options.startMode === "beginning" || options.startMode === "offset",
                });
                if (options.startMode === "offset" && options.offset != null) {
                    consumer.seek({
                        topic: options.topic,
                        partition: options.partition || 0,
                        offset: String(options.offset),
                    });
                }
                timer = setTimeout(() => finish(resolve), timeoutMs);
                await consumer.run({
                    eachMessage: async ({ topic, partition, message }) => {
                        if (options.partition != null && partition !== options.partition) return;
                        messages.push({
                            topic,
                            partition,
                            offset: message.offset,
                            timestamp: message.timestamp,
                            key: bufferToText(message.key),
                            value: bufferToText(message.value),
                            headers: normalizeHeaders(message.headers),
                        });
                        if (messages.length >= limit) await finish(resolve);
                    },
                });
            } catch (error) {
                clearTimeout(timer);
                try {
                    await consumer.disconnect();
                } catch (_disconnectError) {
                }
                reject(error);
            }
        });
    }

    async sendMessage(options: KafkaSendOptions): Promise<any> {
        const producer = this.kafka.producer();
        await producer.connect();
        try {
            const message: any = {
                key: options.key,
                value: options.value,
                headers: options.headers || {},
            };
            if (options.partition != null) message.partition = options.partition;
            return await producer.send({
                topic: options.topic,
                messages: [message],
            });
        } finally {
            await producer.disconnect();
        }
    }

    connect(callback: (err: Error) => void): void {
        this.withAdmin(async (admin) => {
            await admin.listTopics();
            this.connected = true;
        }).then(() => callback(null)).catch((error) => callback(error));
    }

    beginTransaction(callback: (err: Error) => void): void {
        callback(new Error("Kafka connection does not support transactions."));
    }

    rollback(): void {
    }

    commit(): void {
    }

    end(): void {
        this.connected = false;
    }

    isAlive(): boolean {
        return this.connected;
    }
}
