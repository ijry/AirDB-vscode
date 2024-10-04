import { Util } from "@/common/util";
import { ThemeColor, ThemeIcon } from "vscode";
import { DatabaseType, ModelType } from "../../common/constants";
import { QueryUnit } from "../../service/queryUnit";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { TableNode } from "./tableNode";
import * as vscode from 'vscode';
import { Console } from "@/common/Console";
import axios, { AxiosRequestConfig } from "axios";
import { GlobalState } from "@/common/state";
import { NodeUtil } from "../nodeUtil";

export class TableGroup extends Node {

    public iconPath=new ThemeIcon("list-flat")
    public contextValue: string = ModelType.TABLE_GROUP;
    public pinedTables: string[] = []; // 获取当前数据库置顶表的列表
    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Table"));
        this.init(parent);

        if (parent.dbType == DatabaseType.MYSQL) {
            // @ts-ignore
            if (parent.pinedTablesMap != null && parent.pinedTablesMap.default != null) {
                // schemeNode
                // @ts-ignore
                this.pinedTables = parent.pinedTablesMap.default;
            }
        } else {

        }

        // Console.log(this.pinedTables)
        
        if(Util.supportColorIcon){
            this.iconPath = new ThemeIcon("list-flat", new ThemeColor("terminal.ansiBlue"));
        }
    }

    public async updatePinedTables() {
        if (this.isCloud) {
            // 本地缓存更新

            // 远程更新
            // 设置请求头
            let userStateExist = GlobalState.get<any>('userState') || '';
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': userStateExist ? userStateExist.token: ''
            };
            let url = `https://airdb.lingyun.net/api/v1/airdb/conns/updatePinedTables`;
            let pinedTablesMap = {}
            if (this.dbType == DatabaseType.MYSQL) {
                // @ts-ignore
                pinedTablesMap.default = this.pinedTables
            } else {
                // todo
                return;
            }
            const response = await axios.post(url, {
                id: this.cloudId,
                pinedTablesMap
            }, {
                headers: headers
            });
            // 登录失效重置用户状态
            if (response.data.code == 401 || response.data.code == 402) {
                vscode.window.showErrorMessage('AirDb ' + vscode.l10n.t('login expired'))
                GlobalState.update('userState', '');
            }
            if (response.data.code != 200) {
                vscode.window.showErrorMessage('pin failed')
                return;
            }
        } else {
            // 本地更新
            const connectionKey = this.connectionKey;
            const key = this.key
            const connections = this.context.get<{ [key: string]: Node }>(connectionKey, {});
            if (this.dbType == DatabaseType.MYSQL) {
                Console.log(this.pinedTables)
                // @ts-ignore
                if (this.pinedTables != null) {
                    // schemeNode
                    // @ts-ignore
                    this.parent.parent.pinedTablesMap = {
                        default: this.pinedTables
                    }
                }
            } else {
    
            }
            connections[key] = NodeUtil.removeParent(this.parent.parent);
            await this.context.update(connectionKey, connections);
        }
    }

    public async pinTable(table: string) {
        if (!this.pinedTables.includes(table)) {
            this.pinedTables.push(table);
        }
        this.updatePinedTables();
        this.reload();
    }

    public async unpinTable(table: string) {
        this.pinedTables = this.pinedTables.filter(ele => ele !== table);
        this.updatePinedTables();
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
        if (tableNodes == null) {
            tableNodes = [];
        }
        return this.execute<any[]>(this.dialect.showTables(this.schema))
            .then((tables) => {
                let tableNodesPined = [];
                // Console.log(this.pinedTables)
                tables.forEach(table => {
                    // 过滤置顶的表
                    if (!this.pinedTables.includes(table.name)) {
                        tableNodes.push(new TableNode({...table, pined: false}, this));
                    } else {
                        tableNodesPined.push(new TableNode({...table, pined: true}, this))
                    }
                })
                if (tableNodesPined.length > 0) {
                    tableNodes = tableNodesPined.concat(tableNodes);
                }
                if (tableNodes == null || tableNodes.length == 0) {
                    tableNodes = [new InfoNode(vscode.l10n.t("This schema has no table"))];
                }
                this.setChildCache(tableNodes);
                return tableNodes;
            })
            .catch((err) => {
                Console.log(err)
                err.message = 'asdasd'
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.tableTemplate(), 'create-table-template.sql')

    }
}
