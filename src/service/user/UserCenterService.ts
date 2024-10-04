import { CacheKey, CodeCommand, DatabaseType } from "@/common/constants";
import { FileManager, FileModel } from "@/common/filesManager";
import * as vscode from "vscode";
import { ConnectionManager } from "@/service/connectionManager";
import { resolve } from "path";
import { platform } from "os";
import { commands, Disposable, window, workspace } from "vscode";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { ViewManager } from "../../common/viewManager";
import { ConnectionNode } from "../../model/database/connectionNode";
import { Node } from "../../model/interface/node";
import { NodeUtil } from "../../model/nodeUtil";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ClientManager } from "../ssh/clientManager";
import { readFileSync } from "fs";
import { GlobalState, WorkState } from "@/common/state";
import axios, { AxiosRequestConfig } from "axios";
var commandExistsSync = require('command-exists').sync;

// 用户中心服务
export class UserCenterService {

    // 切换隐藏连接名称
    public async hideName(provider: DbTreeDataProvider) {
        let hideName = GlobalState.get('hideName', 0);
        if (hideName == 1) {
            GlobalState.update('hideName', 0);
        } else {
            GlobalState.update('hideName', 1);
        }
        // 刷新
        provider.reload();
    }

    // 打开用户中心webview页面
    public async openPage(provider: DbTreeDataProvider) {
        ViewManager.createWebviewPanel({
            path: "app", title: vscode.l10n.t("UserCenter"),
            splitView: false, iconPath: Global.getExtPath("resources", "icon", "cloud-sync.svg"),
            eventHandler: (handler => {
                handler.on("init", () => {
                    handler.emit('route', 'userCenter')
                }).on("route-userCenter", async () => {
                    let mainPwd = GlobalState.get<any>('mainPwd') || '';
                    handler.emit('userCenterData', {
                        mainPwd: mainPwd
                    })
                }).on("setMainPassword", async data => {
                    try {
                        // 更新主密码
                        GlobalState.update('mainPwd', data.pwd);
                        vscode.window.showInformationMessage(vscode.l10n.t(`Main password set success!`) + data.pwd)
                        // handler.emit("success") // 成功提示

                        // 刷新左侧目录树
                        vscode.commands.executeCommand(CodeCommand.Refresh)
                    } catch (error) {
                        handler.emit("error", error.message) // 失败提示
                    }
                })
            })
        })
    }

}
