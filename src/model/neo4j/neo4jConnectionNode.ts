import { ConfigKey, Constants, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { CommandKey, Node } from "@/model/interface/node";
import * as path from "path";
import * as vscode from "vscode";
import { Neo4jBaseNode } from "./neo4jBaseNode";
import { Neo4jDatabaseGroupNode } from "./neo4jDatabaseGroupNode";
import { Neo4jLabelGroupNode } from "./neo4jLabelGroupNode";
import { Neo4jRelationshipGroupNode } from "./neo4jRelationshipGroupNode";

export class Neo4jConnectionNode extends Neo4jBaseNode {
    public contextValue: string = ModelType.NEO4J_CONNECTION;
    public iconPath: string | vscode.ThemeIcon = path.join(Constants.RES_PATH, "icon/neo4j.svg");

    constructor(readonly key: string, readonly parent: Node) {
        super(key);
        this.init(parent);
        this.label = this.connectionUrl || this.host || "Neo4j";
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
            new Neo4jDatabaseGroupNode(this),
            new Neo4jLabelGroupNode(this),
            new Neo4jRelationshipGroupNode(this),
        ];
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
