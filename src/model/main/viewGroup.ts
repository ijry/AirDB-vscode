import { Util } from "@/common/util";
import { ThemeColor, ThemeIcon } from "vscode";
import { ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { TableNode } from "./tableNode";
import { ViewNode } from "./viewNode";
import * as vscode from 'vscode';

export class ViewGroup extends Node {

    public iconPath=new ThemeIcon("menu")
    public contextValue = ModelType.VIEW_GROUP
    public pinedTables: string[] = []; // 获取当前数据库置顶表的列表
    constructor(readonly parent: Node) {
        super(vscode.env.language.startsWith('zh-') ? "视图" : "View")
        this.init(parent)
        if(Util.supportColorIcon){
            this.iconPath=new ThemeIcon("menu",new ThemeColor("problemsWarningIcon.foreground"))
        }
    }

    public async pinTable(table: string) {
        if (!this.pinedTables.includes(table)) {
            this.pinedTables.push(table);
        }
        this.reload();
    }

    public async unpinTable(table: string) {
        this.pinedTables = this.pinedTables.filter(ele => ele !== table);
        this.reload();
    }

    public async reload() {
        // Console.log(this.pinedTables);
        await this.getChildren(false);
        this.provider.reload(this);
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {

        let tableNodes = this.getChildCache();
        if (tableNodes && !isRresh) {
            return tableNodes;
        }
        return this.execute<any[]>(
            this.dialect.showViews(this.schema))
            .then((tables) => {
                tableNodes = tables.map<TableNode>((table) => {
                    return new ViewNode(table, this);
                });
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This schema has no views")];
                }
                this.setChildCache(tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.viewTemplate(), 'create-view-template.sql')

    }

}
