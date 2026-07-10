import { ConfigKey, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { CommandKey, Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";
import { KafkaConsumerGroupNode } from "./kafkaConsumerGroupNode";
import { KafkaTopicGroupNode } from "./kafkaTopicGroupNode";

export class KafkaConnectionNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_CONNECTION;
    public iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("server-environment");

    constructor(readonly key: string, readonly parent: Node) {
        super(key);
        this.init(parent);
        this.label = this.host || this.brokers || "Kafka";
        if (parent.name) {
            this.name = parent.name;
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true);
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        this.cacheSelf();
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description = (this.description || "") + " closed";
            return;
        }
    }

    async getChildren(): Promise<Node[]> {
        return [
            new KafkaTopicGroupNode(this),
            new KafkaConsumerGroupNode(this),
        ];
    }

    public copyName() {
        Util.copyToBoard(this.brokers || this.host);
    }

    public async deleteConnection() {
        Util.confirm(vscode.l10n.t(`Are you sure you want to Delete Connection {0} ? `, this.label), async () => {
            this.indent({ command: CommandKey.delete });
        });
    }
}
