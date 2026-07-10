import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { Neo4jBaseNode } from "./neo4jBaseNode";
import { Neo4jRelationshipNode } from "./neo4jRelationshipNode";

export class Neo4jRelationshipGroupNode extends Neo4jBaseNode {
    public contextValue: string = ModelType.NEO4J_RELATIONSHIP_GROUP;
    public iconPath = new vscode.ThemeIcon("type-hierarchy");

    constructor(readonly parent: Node, readonly databaseName?: string) {
        super(vscode.l10n.t("Relationship Types"));
        this.init(parent);
        if (databaseName) {
            this.database = databaseName;
        }
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getNeo4jConnection();
            const relationshipTypes = await connection.listRelationshipTypes(this.database);
            if (!relationshipTypes.length) {
                return this.emptyInfo(vscode.l10n.t("This Neo4j database has no relationship type."));
            }
            return relationshipTypes
                .sort((a, b) => a.localeCompare(b))
                .map((relationshipType) => new Neo4jRelationshipNode(relationshipType, this));
        } catch (error) {
            return this.infoOnError("List Neo4j relationship types", error);
        }
    }
}
