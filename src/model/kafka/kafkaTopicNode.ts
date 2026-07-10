import { ModelType } from "@/common/constants";
import { ViewManager } from "@/common/viewManager";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";
import { KafkaPartitionNode } from "./kafkaPartitionNode";

export class KafkaTopicNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_TOPIC;
    public iconPath = new vscode.ThemeIcon("symbol-event");
    public topic: string;

    constructor(topic: string, readonly parent: Node) {
        super(topic);
        this.topic = topic;
        this.init(parent);
        this.command = {
            command: "airdb.kafka.topic.view",
            title: "View Kafka Messages",
            arguments: [this],
        };
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getKafkaConnection();
            const [metadata, offsets] = await Promise.all([
                connection.describeTopics([this.topic]),
                connection.fetchTopicOffsets(this.topic),
            ]);
            const topicMeta = metadata.topics && metadata.topics[0];
            if (!topicMeta || !topicMeta.partitions || topicMeta.partitions.length === 0) {
                return [new InfoNode(vscode.l10n.t("This topic has no partition metadata."))];
            }
            return topicMeta.partitions.map((partition) => new KafkaPartitionNode(this.topic, partition, offsets, this));
        } catch (error) {
            return [new InfoNode(error)];
        }
    }

    public viewMessages() {
        ViewManager.createWebviewPanel({
            title: `${this.topic} messages`,
            type: `kafka-message-viewer-${this.getConnectId()}-${this.topic}`,
            splitView: true,
            singlePage: false,
            path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", "kafkaMessageViewer");
                }).on("route-kafkaMessageViewer", () => {
                    handler.emit("config", {
                        node: {
                            key: this.key,
                            host: this.host,
                            port: this.port,
                            brokers: this.brokers,
                            clientId: this.clientId,
                            kafkaAuth: this.kafkaAuth,
                            user: this.user,
                            password: this.password,
                            useSSL: this.useSSL,
                            caPath: this.caPath,
                            clientCertPath: this.clientCertPath,
                            clientKeyPath: this.clientKeyPath,
                            connectTimeout: this.connectTimeout,
                            requestTimeout: this.requestTimeout,
                            dbType: this.dbType,
                        },
                        topic: this.topic,
                    });
                }).on("readKafkaMessages", async (options) => {
                    try {
                        const connection = await this.getKafkaConnection();
                        const rows = await connection.readMessages({
                            topic: this.topic,
                            partition: options.partition === "" || options.partition == null ? undefined : parseInt(options.partition),
                            startMode: options.startMode,
                            offset: options.offset,
                            limit: options.limit,
                        });
                        handler.emit("messages", rows);
                    } catch (error) {
                        handler.emit("error", error?.message || String(error));
                    }
                });
            },
        });
    }

    public sendMessage() {
        ViewManager.createWebviewPanel({
            title: `${this.topic} producer`,
            type: `kafka-message-producer-${this.getConnectId()}-${this.topic}`,
            splitView: true,
            singlePage: false,
            path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", "kafkaMessageProducer");
                }).on("route-kafkaMessageProducer", () => {
                    handler.emit("config", { topic: this.topic });
                }).on("sendKafkaMessage", async (payload) => {
                    try {
                        const connection = await this.getKafkaConnection();
                        const result = await connection.sendMessage({
                            topic: this.topic,
                            partition: payload.partition === "" || payload.partition == null ? undefined : parseInt(payload.partition),
                            key: payload.key || undefined,
                            value: payload.value || "",
                            headers: payload.headers || {},
                        });
                        handler.emit("sent", result);
                    } catch (error) {
                        handler.emit("error", error?.message || String(error));
                    }
                });
            },
        });
    }
}
