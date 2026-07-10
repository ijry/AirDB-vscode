import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { Neo4jBaseNode } from "./neo4jBaseNode";
import { Neo4jLabelGroupNode } from "./neo4jLabelGroupNode";
import { Neo4jRelationshipGroupNode } from "./neo4jRelationshipGroupNode";

export class Neo4jDatabaseNode extends Neo4jBaseNode {
    public contextValue: string = ModelType.NEO4J_DATABASE;
    public iconPath = new vscode.ThemeIcon("database");

    constructor(public databaseName: string, readonly parent: Node) {
        super(databaseName);
        this.database = databaseName;
        this.init(parent);
        this.database = databaseName;
    }

    async getChildren(): Promise<Node[]> {
        return [
            new Neo4jLabelGroupNode(this, this.databaseName),
            new Neo4jRelationshipGroupNode(this, this.databaseName),
        ];
    }
}
