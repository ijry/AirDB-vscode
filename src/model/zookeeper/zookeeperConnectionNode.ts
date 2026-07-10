import { ConfigKey, Constants, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { CommandKey, Node } from "@/model/interface/node";
import * as path from "path";
import * as vscode from "vscode";
import { ZooKeeperBaseNode } from "./zookeeperBaseNode";
import { ZooKeeperZnodeNode } from "./zookeeperZnodeNode";

export class ZooKeeperConnectionNode extends ZooKeeperBaseNode {
    public contextValue: string = ModelType.ZOOKEEPER_CONNECTION;
    public iconPath: string | vscode.ThemeIcon = path.join(Constants.RES_PATH, "icon/zookeeper.svg");

    constructor(readonly key: string, readonly parent: Node) {
        super(key);
        this.init(parent);
        this.label = this.connectionUrl || this.host || "ZooKeeper";
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
        try {
            const connection = await this.getZooKeeperConnection();
            return [new ZooKeeperZnodeNode(connection.getRootPath(), this)];
        } catch (error) {
            return this.infoOnError("Open ZooKeeper root", error);
        }
    }

    public copyName() {
        Util.copyToBoard(String(this.connectionUrl || this.host || this.label));
    }

    public async deleteConnection() {
        Util.confirm(vscode.l10n.t(`Are you sure you want to Delete Connection {0} ? `, this.label), async () => {
            this.indent({ command: CommandKey.delete });
        });
    }
}
