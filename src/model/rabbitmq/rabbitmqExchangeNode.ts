import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { RabbitMQBaseNode } from "./rabbitmqBase";

export class RabbitMQExchangeNode extends RabbitMQBaseNode {
    public contextValue: string = ModelType.RABBITMQ_EXCHANGE;
    public iconPath = new vscode.ThemeIcon("radio-tower");

    constructor(public meta: any, readonly parent: Node) {
        super(meta.name || "(default)");
        this.description = meta.type || "";
        this.init(parent);
    }
}
