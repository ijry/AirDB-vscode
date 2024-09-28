import { CodeCommand } from '@/common/constants';
import { ClientManager } from '@/service/ssh/clientManager';
import * as path from 'path';
import * as vscode from 'vscode';
import { SSHConfig } from '../interface/sshConfig';
import axios, { AxiosRequestConfig } from "axios";
import { readFileSync, renameSync, writeFileSync } from "fs";
import { GlobalState } from '@/common/state';

export default class ConnectionProvider  {
    public static tempRemoteMap = new Map<string, { cate:string, remote: string, sshConfig: SSHConfig }>()

    constructor() {
        vscode.workspace.onDidSaveTextDocument(async e => {
            const tempPath = path.resolve(e.fileName);
            const data = ConnectionProvider.tempRemoteMap.get(tempPath)
            if (data) {
                switch (data.cate) {
                    case 'sftp':
                        this.saveFile(tempPath, data.remote, data.sshConfig)
                        break;
                    case 'query':
                        let dataId = data.remote
                        let content = readFileSync(tempPath,'utf8')
                        // 设置请求头       
                        let userStateExist = GlobalState.get<any>('userState') || '';
                        const headers = {
                            'Content-Type': 'application/json',
                            'Authorization': userStateExist ? userStateExist.token: ''
                        };
                        let url = `https://airdb.lingyun.net/api/v1/airdb/querys/edit`;
                        let response = await axios.post(url, {
                            id: dataId,
                            content: content
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
                        break;
                    default:
                        break;
                }
                
            }
        })
    }

    async saveFile(tempPath: string, remotePath: string, sshConfig: SSHConfig) {
        const { sftp } = await ClientManager.getSSH(sshConfig)
        sftp.fastPut(tempPath, remotePath, async (err) => {
            if (err) {
                vscode.window.showErrorMessage(err.message)
            } else {
                vscode.commands.executeCommand(CodeCommand.Refresh)
                vscode.window.showInformationMessage("Update to remote success!")
            }
        })
    }

}