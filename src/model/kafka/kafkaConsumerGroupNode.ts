import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";
import { KafkaConsumerGroupItemNode } from "./kafkaConsumerGroupItemNode";

export class KafkaConsumerGroupNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_CONSUMER_GROUP;
    public iconPath = new vscode.ThemeIcon("organization");

    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Consumer Groups"));
        this.init(parent);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getKafkaConnection();
            const groups = await connection.listConsumerGroups();
            if (!groups.length) return [new InfoNode(vscode.l10n.t("This server has no consumer group!"))];
            return groups.map((group) => new KafkaConsumerGroupItemNode(group, this));
        } catch (error) {
            return [new InfoNode(error)];
        }
    }
}
