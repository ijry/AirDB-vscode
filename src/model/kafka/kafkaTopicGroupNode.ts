import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";
import { KafkaTopicNode } from "./kafkaTopicNode";

export class KafkaTopicGroupNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_TOPIC_GROUP;
    public iconPath = new vscode.ThemeIcon("symbol-array");

    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Topics"));
        this.init(parent);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getKafkaConnection();
            const topics = await connection.listTopics();
            if (!topics.length) return [new InfoNode(vscode.l10n.t("This server has no topic!"))];
            return topics.sort().map((topic) => new KafkaTopicNode(topic, this));
        } catch (error) {
            return [new InfoNode(error)];
        }
    }
}
