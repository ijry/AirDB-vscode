import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";

export class KafkaConsumerGroupItemNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_CONSUMER_GROUP_ITEM;
    public iconPath = new vscode.ThemeIcon("account");
    private groupId: string;

    constructor(readonly group: any, readonly parent: Node) {
        super(group.groupId);
        this.groupId = group.groupId;
        this.init(parent);
        this.description = group.protocolType || "";
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getKafkaConnection();
            const [details, offsets] = await Promise.all([
                connection.describeConsumerGroups([this.groupId]),
                connection.fetchConsumerGroupOffsets(this.groupId),
            ]);
            const group = details.groups && details.groups[0];
            const rows: Node[] = [];
            if (group) {
                rows.push(new InfoNode(`state: ${group.state || ""}`));
                rows.push(new InfoNode(`protocol: ${group.protocolType || ""}`));
                rows.push(new InfoNode(`members: ${(group.members || []).length}`));
            }
            for (const topicOffset of offsets || []) {
                for (const partition of topicOffset.partitions || []) {
                    rows.push(new InfoNode(`${topicOffset.topic} partition ${partition.partition}: offset ${partition.offset}`));
                }
            }
            return rows.length ? rows : [new InfoNode(vscode.l10n.t("This consumer group has no offset metadata."))];
        } catch (error) {
            return [new InfoNode(error)];
        }
    }
}
