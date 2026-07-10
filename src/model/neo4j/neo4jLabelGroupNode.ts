import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { Neo4jBaseNode } from "./neo4jBaseNode";
import { Neo4jLabelNode } from "./neo4jLabelNode";

export class Neo4jLabelGroupNode extends Neo4jBaseNode {
    public contextValue: string = ModelType.NEO4J_LABEL_GROUP;
    public iconPath = new vscode.ThemeIcon("symbol-class");

    constructor(readonly parent: Node, readonly databaseName?: string) {
        super(vscode.l10n.t("Labels"));
        this.init(parent);
        if (databaseName) {
            this.database = databaseName;
        }
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getNeo4jConnection();
            const labels = await connection.listLabels(this.database);
            if (!labels.length) {
                return this.emptyInfo(vscode.l10n.t("This Neo4j database has no label."));
            }
            return labels
                .sort((a, b) => a.localeCompare(b))
                .map((label) => new Neo4jLabelNode(label, this));
        } catch (error) {
            return this.infoOnError("List Neo4j labels", error);
        }
    }
}
