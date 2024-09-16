import { Console } from "@/common/Console";
import { FileModel } from "@/common/filesManager";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import { DatabaseCache } from "@/service/common/databaseCache";
import { QueryUnit } from "@/service/queryUnit";
import * as vscode from "vscode";
import { DatabaseType, ModelType } from "../../common/constants";
import { Util } from '../../common/util';
import { ConnectionManager } from "../../service/connectionManager";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { MongoTableGroup } from "../mongo/mongoTableGroup";
import axios, { AxiosRequestConfig } from "axios";

export class RootNode extends Node implements CopyAble {


    public contextValue: string = ModelType.ROOTGROUP;
    public iconPath: string|vscode.ThemeIcon = new vscode.ThemeIcon("database");
    constructor(public label: string, readonly provider: DbTreeDataProvider) {
        super(label)
        this.provider = provider;
        this.collapsibleState = 2;
        // const lcp = ConnectionManager.activeNode;
        // if (this.isActive(lcp) && (lcp.database == this.database)) {
        //     this.iconPath=new vscode.ThemeIcon("database", new vscode.ThemeColor('charts.blue'));
        // } else {
        //     this.iconPath=new vscode.ThemeIcon("database", new vscode.ThemeColor('charts.blue'));
        // }
    }

    // 获取根节点的子项目，一般是连接列表，分为本地和云端。
    public async getChildren(): Promise<Node[]> {
        return new Promise(async (res, rej) => {
            switch (this.key) {
                case 'local':
                    let list = await this.provider.getConnectionNodes()
                    res(list)
                    break;
                case 'cloud':
                    let list2 = await this.provider.getCloudConnectionNodes()
                    res(list2)
                    break;
            
                default:
                    break;
            }
        })
    }
}
