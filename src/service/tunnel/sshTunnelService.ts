import tunnel = require('./tunnel-ssh')
import { Node } from '../../model/interface/node';
import { Console } from '../../common/Console';
import * as portfinder from 'portfinder'
import { DatabaseType } from '@/common/constants';
import { spawn } from "child_process";
import { resolvePrivateKey } from '../ssh/sshConfigResolver';

export class SSHTunnelService {

    private tunelMark: { [key: string]: { tunnel: any, tunnelPort: number } } = {};

    public closeTunnel(connectId: string) {
        if (this.tunelMark[connectId]) {
            this.tunelMark[connectId].tunnel.close()
            delete this.tunelMark[connectId]
        }
    }

    public createTunnel(node: Node, errorCallback: (error) => void): Promise<Node> {
        return new Promise(async (resolve, reject) => {
            const ssh = node.ssh
            const key = node.getConnectId();
            if (this.tunelMark[key]) {
                resolve({ ...node, host: "127.0.0.1", port: this.tunelMark[key].tunnelPort } as Node)
                return;
            }
            const port = await portfinder.getPortPromise();
            node.ssh.tunnelPort = port

            let privateKey: Buffer | undefined;
            try {
                privateKey = resolvePrivateKey(ssh as any)
            } catch (err) {
                // Previously this silently fell through to password auth, which then
                // failed with an unrelated-looking error.
                errorCallback(err)
                resolve(null)
                return;
            }

            const config = {
                username: ssh.username,
                password: ssh.password,
                host: ssh.host,
                port: ssh.port,
                dstHost: node.host,
                dstPort: node.port,
                localHost: '127.0.0.1',
                localPort: port,
                algorithms: ssh.algorithms,
                passphrase: ssh.passphrase,
                privateKey: privateKey ?? null
            };

            this.adapterES(node, config);

            if (ssh.type == 'native') {
                let args = ['-TnNL', `${port}:${config.dstHost}:${config.dstPort}`, config.host, '-p', `${config.port}`];
                if (ssh.privateKeyPath) {
                    args.push('-i', ssh.privateKeyPath)
                }
                const bat = spawn('ssh', args);
                // Every path out of here has to settle the promise. The error and
                // close paths used to only call errorCallback, so a failing ssh
                // subprocess (bad key, unreachable host) left createTunnel pending
                // forever and its caller hanging with it.
                let settled = false;
                const settle = (value: Node) => {
                    if (settled) { return; }
                    settled = true;
                    resolve(value)
                };
                const successHandler = setTimeout(() => {
                    settle({ ...node, host: "127.0.0.1", port } as Node)
                }, ssh.watingTime);
                bat.stderr.on('data', (chunk) => {
                    if (chunk?.toString().match(/^[@\s]+$/)) return;
                    delete this.tunelMark[key]
                    clearTimeout(successHandler)
                    if (errorCallback) { errorCallback(new Error(chunk.toString()?.replace(/@/g, ''))) }
                    settle(null)
                });
                bat.on('error', (err) => {
                    delete this.tunelMark[key]
                    clearTimeout(successHandler)
                    if (errorCallback) { errorCallback(err) }
                    settle(null)
                });
                bat.on('close', (code, signal) => {
                    delete this.tunelMark[key]
                    if (!settled) {
                        clearTimeout(successHandler)
                        if (errorCallback) {
                            errorCallback(new Error(`ssh exited with code ${code}`))
                        }
                        settle(null)
                    }
                });
                return;
            }

            const localTunnel = tunnel(config, (error, server) => {
                if (error) {
                    // Must not fall through: resolving with a node pointing at a port
                    // that never bound made the caller connect to nothing.
                    delete this.tunelMark[key]
                    if (errorCallback) { errorCallback(error) }
                    resolve(null)
                    return;
                }
                this.tunelMark[key] = { tunnel: localTunnel, tunnelPort: port }
                resolve({ ...node, host: "127.0.0.1", port } as Node)
            });
            localTunnel.on('error', (err) => {
                Console.log('Ssh tunel occur error : ' + err);
                if (err && errorCallback) {
                    localTunnel.close()
                    delete this.tunelMark[key]
                    errorCallback(err)
                }
                resolve(null)
            });
        })
    }

    private adapterES(node: Node, config: any) {
        if (node.dbType == DatabaseType.ES) {
            let url = node.host;
            url = url.replace(/^(http|https):\/\//i, '')
            if (url.includes(":")) {
                const split = url.split(":");
                config.dstHost = split[0]
                const portStr = split[1]?.match(/^\d+/)[0]
                config.dstPort = parseInt(portStr)
                node.esUrl = node.host.replace(config.dstHost, '127.0.0.1').replace(config.dstPort, config.localPort)
            } else {
                config.dstHost = url.split("/")[0]
                config.dstPort = '80'
                node.esUrl = node.host.replace(config.dstHost, '127.0.0.1')
            }
        }
    }

}