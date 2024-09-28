import { Constants, ModelType } from "@/common/constants";
import { FileManager } from "@/common/filesManager";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import { QueryUnit } from "@/service/queryUnit";
import { readFileSync, renameSync, writeFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TreeItemCollapsibleState } from "vscode";
import { Node } from "../interface/node";
import axios, { AxiosRequestConfig } from "axios";
import { GlobalState } from "@/common/state";
import ConnectionProvider from '../ssh/connectionProvider';
import { ConnectionManager } from "@/service/connectionManager";

export class QueryNode extends Node {
    public contextValue = ModelType.QUERY;
    public iconPath = new vscode.ThemeIcon("code")
    public dataId?: string;
    public content?: string;
    constructor(public name: string, readonly parent: Node, dataId?: string) {
        super(name)
        if (dataId) {
            this.dataId = dataId // 云端数据ID
        }
        this.init(parent)
        this.collapsibleState = TreeItemCollapsibleState.None
        this.command = {
            command: "airdb.query.open",
            title: "Open Query",
            arguments: [this, true],
        }
    }

    public async getInfo() {
        //if (!this.content) {
            // 设置请求头       
            let userStateExist = GlobalState.get<any>('userState') || '';
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': userStateExist ? userStateExist.token: ''
            };
            let url = `https://airdb.lingyun.net/api/v1/airdb/querys/info?id=${this.dataId}`;
            let response = await axios.get(url, { headers: headers });
            let res = response.data
            // 登录失效重置用户状态
            if (response.data.code == 401 || response.data.code == 402) {
                vscode.window.showErrorMessage('AirDb登录失效')
                GlobalState.update('userState', '');
            }
            if (res.code != 200) {
                vscode.window.showErrorMessage(res.msg)
            }
            this.content = res.data.info.content
        //}
        return this.content
    }

    public async run() {
        let content = ''
        if (this.isCloud) {
            content = await this.getInfo()
        } else {
            content = readFileSync(this.getFilePath(),'utf8')
        }
        ConnectionManager.changeActive(this)
        QueryUnit.runQuery(content,this)
    }

    public async open() {
        if (this.isCloud) {
            // 记录对应关系
            let content = await this.getInfo()
            writeFileSync(this.getFilePath(), content)
            ConnectionProvider.tempRemoteMap.set(path.resolve(this.getFilePath()), { cate: 'query', remote: this.dataId, sshConfig: null })
            await vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(this.getFilePath())
            );
        } else {
            await vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(this.getFilePath())
            );
        }
        ConnectionManager.changeActive(this)
    }

    public async rename() {
        vscode.window.showInputBox({ placeHolder: "Input new name" }).then(async newName => {
            if (newName) {
                if (this.isCloud) {
                    // 设置请求头       
                    let userStateExist = GlobalState.get<any>('userState') || '';
                    const headers = {
                        'Content-Type': 'application/json',
                        'Authorization': userStateExist ? userStateExist.token: ''
                    };
                    let url = `https://airdb.lingyun.net/api/v1/airdb/querys/edit`;
                    let response = await axios.post(url, {
                        id: this.dataId,
                        name: newName
                    }, { headers: headers });
                    let res = response.data
                    // 登录失效重置用户状态
                    if (response.data.code == 401 || response.data.code == 402) {
                        vscode.window.showErrorMessage('AirDb登录失效')
                        GlobalState.update('userState', '');
                    }
                    if (res.code != 200) {
                        vscode.window.showErrorMessage(res.msg)
                    }
                    this.label = newName
                    DbTreeDataProvider.refresh(this.parent)
                } else {
                    renameSync(this.getFilePath(), this.getFilePath(newName))
                    DbTreeDataProvider.refresh(this.parent)
                }
            }
        })
    }

    private getFilePath(newName?: string): string {
        return `${FileManager.storagePath}/query/${this.getConnectId({ withSchema: true })}/${newName || this.name}.sql`;
    }

    private getFilePathCloud(dataId?: string): string {
        return `${FileManager.storagePath}/query/${this.getConnectId({ withSchema: true })}/${dataId || this.dataId}.sql`;
    }


}