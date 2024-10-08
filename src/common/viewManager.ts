import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { WebviewPanel } from "vscode";
import { Console } from "./Console";
import { EventEmitter } from 'events'
import { GlobalState, WorkState } from "@/common/state";
import { CodeCommand } from "@/common/constants";

export class ViewOption {
    public iconPath?:  string|vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
    public path: string;
    public title: string;
    public type?: string;
    public preserveFocus?:boolean;
    public splitView: boolean = false;
    /**
     * keep single page by viewType
     */
    public singlePage?: boolean;
    /**
     * receive webview send message 
     */
    public handleHtml?: (html: string, viewPanel: WebviewPanel) => string;
    public eventHandler?: (handler: Hanlder) => void;
}

export class Hanlder {

    constructor(public panel: WebviewPanel, private eventEmitter: EventEmitter) { }

    on(event: string, callback: (content: any) => void): this {
        this.eventEmitter.on(event, callback)
        return this;
    }

    emit(event: string, content?: any) {
        this.panel.webview.postMessage({ type: event, content })
    }

}

interface ViewState {
    instance: WebviewPanel;
    creating: boolean;
    eventEmitter: EventEmitter;
}

export class ViewManager {

    private static viewStatu: { [key: string]: ViewState } = {};
    private static webviewPath: string;
    public static initExtesnsionPath(extensionPath: string) {
        this.webviewPath = extensionPath + "/out/webview"
    }

    public static createWebviewPanel(viewOption: ViewOption): Promise<WebviewPanel> {

        return new Promise((resolve, reject) => {

            if (typeof (viewOption.singlePage) == 'undefined') { viewOption.singlePage = true }

            if(viewOption.preserveFocus==null){
                viewOption.preserveFocus=true;
            }
            if(!viewOption.type){
                viewOption.type=viewOption.title
            }
            if (!viewOption.singlePage) {
                viewOption.type = viewOption.type + new Date().getTime()
            }

            const viewColumn = viewOption.splitView ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
            const currentStatus = this.viewStatu[viewOption.type]
            if (viewOption.singlePage && currentStatus) {
                if (viewColumn==vscode.ViewColumn.Two && currentStatus.instance?.visible == false) {
                    currentStatus.instance.dispose()
                } else {
                    if(currentStatus.instance?.visible == false){
                        currentStatus.instance.reveal()
                    }
                    currentStatus.eventEmitter.removeAllListeners()
                    if (viewOption.eventHandler) {
                        viewOption.eventHandler(new Hanlder(currentStatus.instance, currentStatus.eventEmitter))
                    }
                    if(currentStatus.creating){
                        return;
                    }
                    currentStatus.eventEmitter.emit('init')
                    return Promise.resolve(currentStatus.instance);
                }
            }
            const webviewPanel = vscode.window.createWebviewPanel(
                viewOption.type,
                viewOption.title,
                { viewColumn, preserveFocus: viewOption.preserveFocus },
                { enableScripts: true, retainContextWhenHidden: true },
            );
            const newStatus = { creating: true, instance: webviewPanel, eventEmitter: new EventEmitter() }
            this.viewStatu[viewOption.type] = newStatus
            const targetPath = `${this.webviewPath}/${viewOption.path}.html`;
            fs.readFile(targetPath, 'utf8', async (err, data) => {
                if (err) {
                    Console.log(err);
                    reject(err);
                    return;
                }
                if (viewOption.iconPath) {
                    if(viewOption.iconPath instanceof Object){
                        webviewPanel.iconPath = viewOption.iconPath
                    }else{
                        webviewPanel.iconPath =vscode.Uri.file(viewOption.iconPath) 
                    }
                }
                const contextPath = path.resolve(targetPath, "..");
                if (viewOption.handleHtml) {
                    data = viewOption.handleHtml(data, webviewPanel)
                }
                webviewPanel.webview.html = this.buildPath(data, webviewPanel.webview, contextPath);

                webviewPanel.onDidDispose(() => {
                    this.viewStatu[viewOption.type] = null
                })
                if (viewOption.eventHandler) {
                    viewOption.eventHandler(new Hanlder(webviewPanel, newStatus.eventEmitter))
                }
                newStatus.eventEmitter.on('loginSuccess', (userState) => {
                    // 存储状态
                    // vscode.window.showErrorMessage(userState.token)
                    GlobalState.update('userState', userState);

                    // 刷新左侧目录树
                    vscode.commands.executeCommand(CodeCommand.Refresh)
                })
                // 注销登录
                newStatus.eventEmitter.on('logout', () => {
                    // 存储状态
                    GlobalState.update('userState', '');

                    webviewPanel.webview.postMessage({ type: 'syncState',
                        content: {
                            lang : vscode.env.language,
                            userState: '' // 用户登录数据{token, userInfo}
                        }
                    })

                    // 刷新左侧目录树
                    vscode.commands.executeCommand(CodeCommand.Refresh)
                })
                let userStateExist = GlobalState.get<any>('userState') || '';
                webviewPanel.webview.onDidReceiveMessage((message) => {
                    if (message.type == 'init') {
                        // console.log('初始化')
                        if (newStatus.creating) {
                            newStatus.eventEmitter.emit(message.type, message.content)
                            newStatus.creating = false
                        }
                        
                        // 发送同步数据
                        webviewPanel.webview.postMessage({ type: 'syncState',
                            content: {
                                lang : vscode.env.language,
                                userState: userStateExist // 用户登录数据{token, userInfo}
                            }
                        })
                    } else {
                        newStatus.eventEmitter.emit(message.type, message.content)
                    }
                })
                resolve(webviewPanel);
            });

        });

    }

    private static buildPath(data: string, webview: vscode.Webview, contextPath: string): string {
        return data.replace(/((src|href)=("|'))(.+?\.(css|js))\b/gi, "$1" + webview.asWebviewUri(vscode.Uri.file(`${contextPath}`)) + "/$4");
    }

}
