import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { Neo4jBaseNode } from "./neo4jBaseNode";
import { Neo4jDatabaseNode } from "./neo4jDatabaseNode";

export class Neo4jDatabaseGroupNode extends Neo4jBaseNode {
    public contextValue: string = ModelType.NEO4J_DATABASE_GROUP;
    public iconPath = new vscode.ThemeIcon("database");

    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Databases"));
        this.init(parent);
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getNeo4jConnection();
            const databases = await connection.listDatabases();
            if (!databases.length) {
                return this.emptyInfo(vscode.l10n.t("This Neo4j connection has no database."));
            }
            return databases
                .sort((a, b) => a.localeCompare(b))
                .map((database) => new Neo4jDatabaseNode(database, this));
        } catch (error) {
            return this.infoOnError("List Neo4j databases", error);
        }
    }
}
