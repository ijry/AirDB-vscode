import { Util } from "@/common/util";
import { ThemeColor, ThemeIcon } from "vscode";
import { DatabaseType, ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { TableNode } from "./tableNode";
import * as vscode from 'vscode';
import { Console } from "@/common/Console";

export class TableGroup extends Node {

    public iconPath=new ThemeIcon("list-flat")
    public contextValue: string = ModelType.TABLE_GROUP;
    public pinedTables: string[] = ['xy_cloud_index']; // 获取当前数据库置顶表的列表
    constructor(readonly parent: Node) {
        super(vscode.env.language.startsWith('zh-') ? "表" : "Table");

        if (parent.dbType == DatabaseType.MYSQL) {
            // @ts-ignore
            if (parent.pinedTablesMap != null && parent.pinedTablesMap.default != null) {
                // schemeNode
                // @ts-ignore
                // parent.pinedTables = parent.pinedTablesMap.default;
            }
        } else {

        }

        this.init(parent);
        Console.log(this.pinedTables)
        
        
        if(Util.supportColorIcon){
            this.iconPath = new ThemeIcon("list-flat", new ThemeColor("terminal.ansiBlue"));
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
            let tableNodesPined = [];
            let tableNodesNew = []
            tableNodes.forEach((table: TableNode) => {
                // 过滤置顶的表
                if (!this.pinedTables.includes(table.table)) {
                    table.pined = false;
                    table.iconPath=new vscode.ThemeIcon("split-horizontal");
                    tableNodesNew.push(table);
                } else {
                    table.pined = true;
                    table.iconPath=new vscode.ThemeIcon("pinned");
                    tableNodesPined.push(table);
                }
            });
            if (tableNodesPined.length > 0) {
                tableNodesNew = tableNodesPined.concat(tableNodesNew);
            }
            return tableNodesNew;
        }
        return this.execute<any[]>(this.dialect.showTables(this.schema))
            .then((tables) => {
                let tableNodesPined = [];
                tableNodes = tables.map<TableNode>((table) => {
                    // 过滤置顶的表
                    if (!this.pinedTables.includes(table.name)) {
                        return new TableNode({...table, pined: false}, this);
                    } else {
                        tableNodesPined.push(new TableNode({...table, pined: true}, this))
                    }
                });
                if (tableNodesPined.length > 0) {
                    tableNodes = tableNodesPined.concat(tableNodes);
                }
                if (tableNodes.length == 0) {
                    tableNodes = [new InfoNode("This schema has no table")];
                }
                this.setChildCache(tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.tableTemplate(), 'create-table-template.sql')

    }
}
