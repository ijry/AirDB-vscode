import { ThemeIcon } from "vscode";
import { ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { FunctionNode } from "./function";
import * as vscode from 'vscode';

export class FunctionGroup extends Node {

    public contextValue = ModelType.FUNCTION_GROUP;
    public iconPath = new ThemeIcon("symbol-function")
    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Function"))
        this.init(parent)
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = this.getChildCache();
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(this.dialect.showFunctions(this.schema))
            .then((tables) => {
                tableNodes = tables.map<FunctionNode>((table) => {
                    return new FunctionNode(table.ROUTINE_NAME, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode(vscode.l10n.t("This schema has no function"))];
                }
                this.setChildCache(tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.functionTemplate(), 'create-function-template.sql')

    }

}
