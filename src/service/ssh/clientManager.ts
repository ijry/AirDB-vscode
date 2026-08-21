import * as vscode from 'vscode';
import { Client, SFTPWrapper } from "ssh2";
import { SSHConfig } from '@/model/interface/sshConfig';
import { buildConnectConfig } from './sshConfigResolver';

class SSH {
    client: Client;
    sftp: SFTPWrapper;
}

class SSHOption {
    withSftp: boolean = false;
}

export class ClientManager {

    private static activeClient: { [key: string]: SSH } = {};

    private static getClientKey(sshConfig: SSHConfig) {
        return `${sshConfig.key}_${sshConfig.host}_${sshConfig.port}_${sshConfig.username}`;
    }

    public static getSSH(sshConfig: SSHConfig, option: SSHOption = { withSftp: true }): Promise<SSH> {

        const key = this.getClientKey(sshConfig);
        if (this.activeClient[key]) {
            return Promise.resolve(this.activeClient[key]);
        }

        let connectConfig: SSHConfig & { readyTimeout: number };
        try {
            connectConfig = buildConnectConfig(sshConfig);
        } catch (err) {
            vscode.window.showErrorMessage(err.message)
            return Promise.reject(err)
        }

        const client = new Client();
        return new Promise((resolve, reject) => {
            client.on('ready', () => {
                if (option.withSftp) {
                    client.sftp((err, sftp) => {
                        if (err) {
                            this.activeClient[key] = null
                            vscode.window.showErrorMessage(err.message)
                            reject(err)
                            return
                        }
                        this.activeClient[key] = { client, sftp };
                        resolve(this.activeClient[key])
                    })
                } else {
                    resolve({ client, sftp: null })
                }

            }).on('error', (err) => {
                this.activeClient[key] = null
                vscode.window.showErrorMessage(err.message)
                reject(err)
            }).on('end', () => {
                this.activeClient[key] = null
            }).connect(connectConfig);
            // https://blog.csdn.net/a351945755/article/details/22661411
        })

    }

    public static closeSSH(sshConfig?: SSHConfig) {
        if (!sshConfig) {
            return;
        }
        const key = this.getClientKey(sshConfig);
        const activeClient = this.activeClient[key];
        if (activeClient?.client) {
            activeClient.client.end();
        }
        this.activeClient[key] = null;
    }

}
