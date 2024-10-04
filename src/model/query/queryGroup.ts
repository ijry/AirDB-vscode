import { Constants, ModelType } from "@/common/constants";
import { FileManager } from "@/common/filesManager";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Node } from "../interface/node";
import { InfoNode } from "../other/infoNode";
import { QueryNode } from "./queryNode";
import axios, { AxiosRequestConfig } from "axios";
import { GlobalState } from "@/common/state";

// 查询组节点
export class QueryGroup extends Node {
    public contextValue = ModelType.QUERY_GROUP;
    public iconPath = new vscode.ThemeIcon("code")
    private storePath: string;
    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Query"))
        this.init(parent)
        this.storePath = `${FileManager.storagePath}/query/${this.getConnectId({ withSchema: true })}`;
    }

    // 获取查询列表
    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let queries = [];
        if (this.isCloud) {
            // 云端
            // 设置请求头       
            let userStateExist = GlobalState.get<any>('userState') || '';
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': userStateExist ? userStateExist.token: ''
            };
            let url = `https://airdb.lingyun.net/api/v1/airdb/querys/lists?connsId=${this.cloudId}&schemaName=${this.schema}`;
            let response = await axios.get(url, { headers: headers });
            let res = response.data
            // 登录失效重置用户状态
            if (response.data.code == 401 || response.data.code == 402) {
                vscode.window.showErrorMessage('AirDb' + vscode.l10n.t('login expired'))
                GlobalState.update('userState', '');
            }
            if (res.code != 200) {
                vscode.window.showErrorMessage(res.msg)
            }
            res.data.dataList.forEach(ele => {
                queries.push(new QueryNode(ele.name, this, ele.id))
            });
        } else {
            // 本地
            queries = this.readdir(this.storePath)?.map(fileName => new QueryNode(fileName.replace(/\.[^/.]+$/, ""), this));
        }
        if (!queries || queries.length == 0) {
            return [new InfoNode(vscode.l10n.t("There is no saved query."))]
        }
        return queries
    }

    readdir(path: string): string[] {
        try {
            return readdirSync(path)
        } catch (error) {
            return null;
        }
    }

    public add() {
        if (!existsSync(this.storePath)) {
            mkdirSync(this.storePath, { recursive: true });
        }
        vscode.window.showInputBox({ placeHolder: "queryName" }).then(async name => {
            if (name) {
                const sqlPath = `${this.storePath}/${name}.sql`
                if (this.isCloud) {
                    // 设置请求头       
                    let userStateExist = GlobalState.get<any>('userState') || '';
                    const headers = {
                        'Content-Type': 'application/json',
                        'Authorization': userStateExist ? userStateExist.token: ''
                    };
                    let url = `https://airdb.lingyun.net/api/v1/airdb/querys/add`;
                    let response = await axios.post(url, {
                        connsId: this.cloudId,
                        schemaName: this.schema,
                        name: name
                    }, { headers: headers });
                    let res = response.data
                    // 登录失效重置用户状态
                    if (response.data.code == 401 || response.data.code == 402) {
                        vscode.window.showErrorMessage('AirDb' + vscode.l10n.t('login expired'))
                        GlobalState.update('userState', '');
                    }
                    if (res.code != 200) {
                        vscode.window.showErrorMessage(res.msg)
                    }
                } else {
                    writeFileSync(sqlPath, '')
                }
                DbTreeDataProvider.refresh(this)
            }
        })
    }

}