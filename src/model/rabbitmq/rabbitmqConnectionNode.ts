import { ConfigKey, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { CommandKey, Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { RabbitMQBaseNode } from "./rabbitmqBase";
import { RabbitMQExchangeGroupNode } from "./rabbitmqExchangeGroupNode";
import { RabbitMQQueueGroupNode } from "./rabbitmqQueueGroupNode";

export class RabbitMQConnectionNode extends RabbitMQBaseNode {
    public contextValue: string = ModelType.RABBITMQ_CONNECTION;
    public iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("server-environment");

    constructor(readonly key: string, readonly parent: Node) {
        super(key);
        this.init(parent);
        this.label = this.host || "RabbitMQ";
        if (parent.name) {
            this.name = parent.name;
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true);
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        this.cacheSelf();
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description = (this.description || "") + " closed";
        }
    }

    async getChildren(): Promise<Node[]> {
        return [
            new RabbitMQQueueGroupNode(this),
            new RabbitMQExchangeGroupNode(this),
        ];
    }

    public copyName() {
        Util.copyToBoard(this.host);
    }

    public async deleteConnection() {
        Util.confirm(vscode.l10n.t(`Are you sure you want to Delete Connection {0} ? `, this.label), async () => {
            this.indent({ command: CommandKey.delete });
        });
    }
}
