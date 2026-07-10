import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { RabbitMQBaseNode } from "./rabbitmqBase";
import { RabbitMQExchangeNode } from "./rabbitmqExchangeNode";

export class RabbitMQExchangeGroupNode extends RabbitMQBaseNode {
    public contextValue: string = ModelType.RABBITMQ_EXCHANGE_GROUP;
    public iconPath = new vscode.ThemeIcon("symbol-event");

    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Exchanges"));
        this.init(parent);
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getRabbitMQConnection();
            const exchanges = await connection.listExchanges();
            if (!exchanges.length) {
                return [new InfoNode(vscode.l10n.t("This vhost has no exchange."))];
            }
            return exchanges.map((exchange) => new RabbitMQExchangeNode(exchange, this));
        } catch (error) {
            return [new InfoNode(error)];
        }
    }
}
