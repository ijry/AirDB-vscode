import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";

export class KafkaPartitionNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_PARTITION;
    public iconPath = new vscode.ThemeIcon("list-tree");

    constructor(readonly topic: string, readonly partition: any, readonly offsets: any[], readonly parent: Node) {
        super(`partition ${partition.partitionId}`);
        this.init(parent);
        const offset = offsets.find((item) => String(item.partition) === String(partition.partitionId));
        const low = offset ? offset.low : "";
        const high = offset ? (offset.high || offset.offset) : "";
        this.description = `leader ${partition.leader} offset ${low}-${high}`;
        this.tooltip = `replicas: ${(partition.replicas || []).join(", ")} | isr: ${(partition.isr || []).join(", ")}`;
    }
}
