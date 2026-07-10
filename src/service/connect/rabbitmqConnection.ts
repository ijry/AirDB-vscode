import axios, { AxiosInstance } from "axios";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";

export interface RabbitMQMessage {
    payload: string;
    payload_bytes: number;
    exchange: string;
    routing_key: string;
    redelivered: boolean;
    properties: any;
}

export interface RabbitMQPublishOptions {
    queue?: string;
    exchange?: string;
    routingKey?: string;
    payload: string;
    persistent?: boolean;
    contentType?: string;
}

type AmqpConnect = (url: string, options?: any) => Promise<any>;

function connectRabbitMQ(url: string, options?: any): Promise<any> {
    const amqp = require("amqplib") as { connect: AmqpConnect };
    return amqp.connect(url, options);
}

function trimSlash(value: string): string {
    return value ? value.replace(/\/+$/, "") : value;
}

function encodeVhost(vhost: string): string {
    return encodeURIComponent(vhost || "/");
}

export function createRabbitMQAmqpUrl(node: Node | any): string {
    if (node.connectionUrl) return node.connectionUrl;
    const protocol = node.useSSL ? "amqps" : "amqp";
    const host = node.host || "127.0.0.1";
    const port = node.port || (node.useSSL ? 5671 : 5672);
    const vhost = encodeURIComponent(node.database || node.vhost || "/");
    const user = encodeURIComponent(node.user || "guest");
    const password = encodeURIComponent(node.password || "guest");
    return `${protocol}://${user}:${password}@${host}:${port}/${vhost}`;
}

export function createRabbitMQManagementUrl(node: Node | any): string {
    if (node.managementUrl) return trimSlash(node.managementUrl);
    const protocol = node.managementUseSSL ? "https" : "http";
    const host = node.host || "127.0.0.1";
    const port = node.managementPort || 15672;
    return `${protocol}://${host}:${port}/api`;
}

export class RabbitMQConnection extends IConnection {
    private connection: any;
    private channel: any;
    private connected = false;
    private managementClient: AxiosInstance;

    constructor(
        private node: Node,
        private amqpConnect: AmqpConnect = connectRabbitMQ,
        managementClient?: AxiosInstance
    ) {
        super();
        this.managementClient = managementClient || axios.create({
            baseURL: createRabbitMQManagementUrl(node),
            timeout: parseInt(String(node.requestTimeout || 10000)),
            auth: {
                username: node.user || "guest",
                password: node.password || "guest",
            },
        });
    }

    query(_sql: string, callback?: queryCallback): void;
    query(_sql: string, _values: any, callback?: queryCallback): void;
    query(_sql: any, values?: any, callback?: any) {
        const cb = callback || (values instanceof Function ? values : null);
        if (cb) cb(new Error("RabbitMQ connection does not support SQL query."));
    }

    async listQueues(): Promise<any[]> {
        const response = await this.managementClient.get(`/queues/${encodeVhost(this.node.database || this.node.vhost || "/")}`);
        return response.data || [];
    }

    async listExchanges(): Promise<any[]> {
        const response = await this.managementClient.get(`/exchanges/${encodeVhost(this.node.database || this.node.vhost || "/")}`);
        return response.data || [];
    }

    async getMessages(queue: string, count = 20, requeue = true): Promise<RabbitMQMessage[]> {
        const response = await this.managementClient.post(
            `/queues/${encodeVhost(this.node.database || this.node.vhost || "/")}/${encodeURIComponent(queue)}/get`,
            {
                count,
                ackmode: requeue ? "ack_requeue_true" : "ack_requeue_false",
                encoding: "auto",
                truncate: 50000,
            }
        );
        return response.data || [];
    }

    async publishMessage(options: RabbitMQPublishOptions): Promise<boolean> {
        const payload = Buffer.from(options.payload || "");
        const publishOptions = {
            persistent: options.persistent !== false,
            contentType: options.contentType || "text/plain",
        };
        if (options.exchange) {
            return this.channel.publish(options.exchange, options.routingKey || "", payload, publishOptions);
        }
        return this.channel.sendToQueue(options.queue, payload, publishOptions);
    }

    connect(callback: (err: Error) => void): void {
        this.amqpConnect(createRabbitMQAmqpUrl(this.node), {
            timeout: parseInt(String(this.node.connectTimeout || 5000)),
        }).then(async (connection) => {
            this.connection = connection;
            this.channel = await connection.createChannel();
            this.connected = true;
            callback(null);
        }).catch((error) => callback(error));
    }

    beginTransaction(callback: (err: Error) => void): void {
        callback(new Error("RabbitMQ connection does not support transactions."));
    }

    rollback(): void {
    }

    commit(): void {
    }

    end(): void {
        this.connected = false;
        if (this.channel) this.channel.close().catch(() => {});
        if (this.connection) this.connection.close().catch(() => {});
    }

    isAlive(): boolean {
        return this.connected;
    }
}
