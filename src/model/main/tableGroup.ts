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
import { FilterNode } from "../other/FilterNode";
import { Global } from "@/common/global";

export class TableGroup extends Node {

    public iconPath=new ThemeIcon("list-flat")
    public contextValue: string = ModelType.TABLE_GROUP;
    public pinedTables: string[] = []; // 获取当前数据库置顶表的列表
    // 存储不同数据库不同表置顶/查询SQl用的key
    // 不能使用uid会造成执行SQL文件时无法自动获取激活的数据库
    public stateKey:string = '';
    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Table"));
        this.init(parent);

        if (parent.dbType == DatabaseType.MYSQL) {
            this.stateKey = this.key + '-default-' + this.parent.label + '-TableFilterKeyword'
            // @ts-ignore
            if (parent.pinedTablesMap != null && parent.pinedTablesMap['default-' + this.parent.label] != null) {
                // schemeNode
                // @ts-ignore
                this.pinedTables = parent.pinedTablesMap['default-' + this.parent.label];
            }
        } else if(parent.dbType == DatabaseType.MSSQL || parent.dbType == DatabaseType.PG) {
            // this.parent.parent is catalog
            // this.parent is schema
            this.stateKey = this.key + '-' + this.parent.parent.label + '-' + this.parent.label + '-TableFilterKeyword'
            
            // @ts-ignore
            if (parent.pinedTablesMap != null && parent.pinedTablesMap[this.parent.parent.label + '-' + this.parent.label] != null) {
                this.pinedTables = parent.pinedTablesMap[this.parent.parent.label + '-' + this.parent.label];
            }
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
                pinedTablesMap['default-' + this.parent.label] = this.pinedTables
            } else if(this.parent.dbType == DatabaseType.MSSQL || this.parent.dbType == DatabaseType.PG) {
                // @ts-ignore
                pinedTablesMap[this.parent.parent.label + '-' + this.parent.label] = this.pinedTables
            } else {
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
                    if (this.parent.parent.pinedTablesMap == null) {
                        this.parent.parent.pinedTablesMap = {};
                    }
                    this.parent.parent.pinedTablesMap['default-' + this.parent.label] = this.pinedTables;
                }
                connections[key] = NodeUtil.removeParent(this.parent.parent);
            } else if(this.parent.dbType == DatabaseType.MSSQL || this.parent.dbType == DatabaseType.PG) {
                // @ts-ignore
                if (this.pinedTables != null) {
                    // schemeNode
                    // @ts-ignore
                    if (this.parent.parent.parent.pinedTablesMap == null) {
                        this.parent.parent.parent.pinedTablesMap = {};
                    }
                    this.parent.parent.parent.pinedTablesMap['default-' + this.parent.label] = this.pinedTables;
                }
                connections[key] = NodeUtil.removeParent(this.parent.parent.parent);
            } else {
                return;
            }
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

    // 表筛选
    public filterTable() {
        let tableFilterKeyword = GlobalState.get<any>(this.stateKey) || '';
        vscode.window.showInputBox({
            prompt: vscode.l10n.t(`Enter keyword to filter tables`),
            value: tableFilterKeyword,
            placeHolder: vscode.l10n.t('table name keyword') }).then(async (inputContent) => {
            if (inputContent) {
                GlobalState.update(this.stateKey, inputContent.trim());
                vscode.window.showInformationMessage(vscode.l10n.t(`filter success!`))
            } else {
                GlobalState.update(this.stateKey, '');
                vscode.window.showErrorMessage(`Cancel`)
            }
            this.reload();
        })
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        // 获取表搜索
        let tableFilterLabel = '';
        let tableFilterKeyword = GlobalState.get<any>(this.stateKey) || '';
        if (!tableFilterKeyword) {
            tableFilterLabel = vscode.l10n.t("Filter: click to filter");
        } else {
            tableFilterLabel = vscode.l10n.t('Filtered') + ': ' + tableFilterKeyword;
        }
        
        // 获取表列表
        let tableNodes = this.getChildCache();
        if (tableNodes && !isRresh) {
            let tableNodesPined = [];
            let tableNodesFilter = [];
            let tableNodesNew = [];
            tableNodes.forEach((table: TableNode) => {
                // 过滤置顶的表
                if (!this.pinedTables.includes(table.table)) {
                    table.pined = false;
                    // 支持多个字符搜索
                    let tableFilterKeywordList = [];
                    if (tableFilterKeyword) {
                        tableFilterKeywordList = tableFilterKeyword.split(',');
                    } else {
                        tableFilterKeywordList = [];
                    }
                    // Console.log(tableFilterKeywordList);
                    if (tableFilterKeywordList.length > 0) {
                        let hit = false;
                        tableFilterKeywordList.forEach((eleKeyword) => {
                            if (table.table.indexOf(eleKeyword) > -1) {
                                // 筛选
                                table.iconPath = new vscode.ThemeIcon("search");
                                tableNodesFilter.push(table);
                                hit = true;
                            }
                        })
                        // 获取配置决定是否显示除筛选外的表
                        if (!hit && Global.getConfig('showLeftTables')) {
                            table.iconPath = new vscode.ThemeIcon("split-horizontal");
                            tableNodesNew.push(table);
                        }
                    } else {
                        table.iconPath = new vscode.ThemeIcon("split-horizontal");
                        tableNodesNew.push(table);
                    }
                } else {
                    table.pined = true;
                    table.iconPath = new vscode.ThemeIcon("pinned");
                    tableNodesPined.push(table);
                }
            });
            if (tableNodesPined.length > 0 || tableNodesFilter.length > 0) {
                // tableNodesNew = tableNodesPined.concat(tableNodesFilter, tableNodesNew);
            }
            return [new FilterNode(tableFilterLabel, this), ...tableNodesPined, ...tableNodesFilter, ...tableNodesNew];
        }
        tableNodes = [];
        return this.execute<any[]>(this.dialect.showTables(this.schema))
            .then((tables) => {
                let tableNodesPined = [];
                let tableNodesFilter = [];
                let tableNodesNew = [];
                // Console.log(this.pinedTables)
                tables.forEach(table => {
                    // 过滤置顶的表
                    if (!this.pinedTables.includes(table.name)) {
                        // 支持多个字符搜索
                        let tableFilterKeywordList = [];
                        if (tableFilterKeyword) {
                            tableFilterKeywordList = tableFilterKeyword.split(',');
                        } else {
                            tableFilterKeywordList = [];
                        }
                        if (tableFilterKeywordList.length > 0) {
                            let hit = false;
                            tableFilterKeywordList.forEach((eleKeyword) => {
                                if (table.name.indexOf(eleKeyword) > -1) {
                                    // 筛选
                                    table.iconPath = new vscode.ThemeIcon("search");
                                    tableNodesFilter.push(new TableNode({...table, pined: false}, this));
                                    hit = true;
                                }
                            })
                            if (!hit && Global.getConfig('showLeftTables')) {
                                table.iconPath = new vscode.ThemeIcon("split-horizontal");
                                tableNodesNew.push(table);
                            }
                        } else {
                            table.iconPath = new vscode.ThemeIcon("split-horizontal");
                            tableNodes.push(new TableNode({...table, pined: false}, this));
                        }
                    } else {
                        tableNodesPined.push(new TableNode({...table, pined: true}, this))
                    }
                })
                if (tableNodesPined.length > 0 || tableNodesFilter.length > 0) {
                    tableNodes = tableNodesPined.concat(tableNodesFilter, tableNodes);
                }
                if (tableNodes == null || tableNodes.length == 0) {
                    tableNodes = [new InfoNode(vscode.l10n.t("This schema has no table"))];
                }
                this.setChildCache(tableNodes);
                return [new FilterNode(tableFilterLabel, this), ...tableNodes];
            })
            .catch((err) => {
                Console.log(err)
                return [new InfoNode(err)];
            });
    }

    public async createTemplate() {

        QueryUnit.showSQLTextDocument(this, this.dialect.tableTemplate(), 'create-table-template.sql')

    }
}
