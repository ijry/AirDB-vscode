import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { Neo4jBaseNode } from "./neo4jBaseNode";

export class Neo4jLabelNode extends Neo4jBaseNode {
    public contextValue: string = ModelType.NEO4J_LABEL;
    public iconPath = new vscode.ThemeIcon("symbol-class");

    constructor(public labelName: string, readonly parent: Node) {
        super(labelName);
        this.init(parent);
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }
}
