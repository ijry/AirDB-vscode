import { ModelType } from "../../common/constants";
import { Node } from "../interface/node";
import * as vscode from "vscode";

export class FilterNode extends Node {
    public iconPath: string|vscode.ThemeIcon = new vscode.ThemeIcon("search");
    public contextValue: string = 'filter';
    constructor(readonly label: string, parent: Node) {
        super( vscode.l10n.t('Filter') + ': ' + label)

        // 默认点击事件
        this.command = {
            command: "airdb.table.filter",
            title: vscode.l10n.t("Filter Table"),
            arguments: [parent],
        }
    }

    public async getChildren(): Promise<Node[]> {
        return [];
    }
}
