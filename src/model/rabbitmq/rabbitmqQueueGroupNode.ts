import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { RabbitMQBaseNode } from "./rabbitmqBase";
import { RabbitMQQueueNode } from "./rabbitmqQueueNode";

export class RabbitMQQueueGroupNode extends RabbitMQBaseNode {
    public contextValue: string = ModelType.RABBITMQ_QUEUE_GROUP;
    public iconPath = new vscode.ThemeIcon("list-tree");

    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Queues"));
        this.init(parent);
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getRabbitMQConnection();
            const queues = await connection.listQueues();
            if (!queues.length) {
                return [new InfoNode(vscode.l10n.t("This vhost has no queue."))];
            }
            return queues.map((queue) => new RabbitMQQueueNode(queue, this));
        } catch (error) {
            return [new InfoNode(error)];
        }
    }
}
