import { ModelType } from "@/common/constants";
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
        vscode.window.showInformationMessage(`Kafka message viewer: ${this.topic}`);
    }

    public sendMessage() {
        vscode.window.showInformationMessage(`Kafka message producer: ${this.topic}`);
    }
}
