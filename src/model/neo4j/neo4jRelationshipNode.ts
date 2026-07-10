import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { Neo4jBaseNode } from "./neo4jBaseNode";

export class Neo4jRelationshipNode extends Neo4jBaseNode {
    public contextValue: string = ModelType.NEO4J_RELATIONSHIP;
    public iconPath = new vscode.ThemeIcon("type-hierarchy");

    constructor(public relationshipType: string, readonly parent: Node) {
        super(relationshipType);
        this.init(parent);
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
}
