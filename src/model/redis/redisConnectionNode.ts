import { Console } from "@/common/Console";
import { ConfigKey, Constants, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { ViewManager } from "@/common/viewManager";
import { CommandKey, Node } from "@/model/interface/node";
import { NodeUtil } from "@/model/nodeUtil";
import * as path from "path";
import * as vscode from "vscode";
import { RedisFolderNode } from "./folderNode";
import RedisBaseNode from "./redisBaseNode";
import { DbNode } from "./dbNode";
var commandExistsSync = require('command-exists').sync;

export class RedisConnectionNode extends RedisBaseNode {


    contextValue = ModelType.REDIS_CONNECTION;
    iconPath: string | vscode.ThemeIcon = path.join(Constants.RES_PATH, `image/redis_connection.png`);

    constructor(readonly key: string, readonly parent: Node) {
        super(key)
        this.init(parent)
        this.label = (this.usingSSH) ? `${this.ssh.host}@${this.ssh.port}` : `${this.host}@${this.port}`;
        if ( parent.name) {
            this.name = parent.name
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true)
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description = (this.description||'') + " closed"
            return;
        }
    }

    // 获取redis数据库，比如db0/db8。
    async getDbList() {  
        try {
            // 获取redise实例
            const client = await this.getClient();
            // 根据keyspace获取信息，client.info中包含很多redis基础信息。
            const keySpaceInfo = await client.info("keyspace");
            const listData = {};

            keySpaceInfo.split('\n').filter(line => line.trim().startsWith("db")).forEach(line => {
                const [dbPrefix, keysString] = line.trim().split(":", 2);
                if (!keysString) return;

                const dbNumber = dbPrefix.replace("db", "");  // 数据库编号比如db8的8
                const keyEntries = keysString.split(",").map(key => key.split("="));
                listData[dbNumber] = {
                    name: dbNumber,
                    ...Object.fromEntries(keyEntries)
                };
            });

            return listData;  
        } catch (error) {  
            Console.log(error);  
            return {};  
        }  
    }

    // 获取redis数据库，比如db0/db8
    async getChildren(): Promise<Node[]> {  
        // 获取数据库列表  
        const dbList = await this.getDbList();  
      
        // 初始化一个数组，其长度等于 Redis 数据库的数量（默认为16），  
        // 并填充默认对象（如果数据库列表中没有对应索引的数据库）  
        // 注意：这里假设redis.databaseCount是Redis服务器配置的数据库数量，或者默认为16  
        // 同时，检查是否应该包含所有数据库（this.redis?.showAllDb.database）  
        const databases = Array(16)  
            .fill(0)  
            .map((_, index) => {  
                // 如果dbList中有对应的数据库信息，则使用它；否则使用默认信息  
                const dbInfo = dbList[index] || { name: index, keys: "0" };  
      
                // 如果应该包含所有数据库，或者当前数据库索引与特定数据库匹配，则返回该数据库信息  
                return  this.database === `${index}` || dbList[index]  
                    ? dbInfo  
                    : null; // 如果不需要这个数据库，可以返回null，稍后用filter过滤掉  
            })  
            // 过滤掉不需要的数据库（如果有返回null的情况）  
            .filter(dbInfo => dbInfo !== null);  
      
        // 如果没有数据库返回，则创建一个默认的DbNode对象  
        if (databases.length === 0) {  
            return [new DbNode({ name: "0", keys: "0" }, this)];  
        }  
      
        // 否则，将每个数据库信息转换为DbNode对象并返回  
        return databases.map(dbInfo => new DbNode(dbInfo, this));  
    }

    async openTerminal(): Promise<any> {
        if (!this.password && commandExistsSync('redis-cli')) {
            super.openTerminal();
            return;
        }
        const client = await this.getClient()
        ViewManager.createWebviewPanel({
            splitView: true, title: `${this.host}@${this.port}`, preserveFocus: false,
            iconPath: {
                light: Util.getExtPath("image", "terminal_light.png"),
                dark: Util.getExtPath("image", "terminal_dark.svg"),
            }, path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", 'terminal')
                }).on("route-terminal", async () => {
                    handler.emit("config", NodeUtil.removeParent(this))
                }).on("exec", async (content) => {
                    if (!content) {
                        return;
                    }
                    const splitCommand: string[] = content.replace(/ +/g, " ").split(' ')
                    const command = splitCommand.shift()
                    const reply = await client.send_command(command, splitCommand)
                    handler.emit("result", reply)
                }).on("exit", () => {
                    handler.panel.dispose()
                })
            }
        })
    }

    async showStatus(): Promise<any> {
        const client = await this.getClient()
        client.info((err, reply) => {
            ViewManager.createWebviewPanel({
                title: "Redis Server Status", splitView: false,
                path: "app",
                eventHandler: (handler) => {
                    handler.on("init", () => {
                        handler.emit("route", 'redisStatus')
                    }).on("route-redisStatus", async () => {
                        handler.emit("info", reply)
                    })
                }
            })
        })
    }

    public copyName() {
        Util.copyToBoard(this.host)
    }

    public async deleteConnection(context: vscode.ExtensionContext) {

        Util.confirm(`Are you sure you want to Delete Connection ${this.label} ? `, async () => {
            this.indent({ command: CommandKey.delete })
        })

    }

}

