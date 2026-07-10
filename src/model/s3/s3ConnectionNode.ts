import { ConfigKey, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { CommandKey, Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { S3BaseNode } from "./s3BaseNode";

export class S3ConnectionNode extends S3BaseNode {
    public contextValue: string = ModelType.S3_CONNECTION;
    public iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("cloud");

    constructor(readonly key: string, readonly parent: Node) {
        super(key);
        this.init(parent);
        this.label = this.endpoint || this.host || "S3";
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
        return [];
    }

    public copyName() {
        Util.copyToBoard(String(this.endpoint || this.host || this.label));
    }

    public async deleteConnection() {
        Util.confirm(vscode.l10n.t(`Are you sure you want to Delete Connection {0} ? `, this.label), async () => {
            this.indent({ command: CommandKey.delete });
        });
    }
}
