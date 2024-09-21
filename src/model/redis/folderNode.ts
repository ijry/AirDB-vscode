import { Constants, ModelType } from "@/common/constants";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import * as path from "path";
import { ThemeColor, ThemeIcon } from "vscode";
import KeyNode from "./keyNode";
import RedisBaseNode from "./redisBaseNode";
import { DbNode } from "./dbNode";
import { Console } from "../../common/Console";
import { InfoNode } from "../other/infoNode";

export class RedisFolderNode extends RedisBaseNode {
    contextValue = ModelType.REDIS_FOLDER;
    readonly iconPath = path.join(Constants.RES_PATH, `image/redis_folder.svg`);
    // readonly iconPath =new ThemeIcon("folder")
    constructor(readonly label: string, readonly childens: string[], readonly parent: RedisBaseNode) {
        super(label)
        this.init(parent)
        this.pattern = label // 其实就是key的prefix
        this.level = parent.hasOwnProperty('level') ? parent.level + 1 : 0
    }

    // 获取redis的key列表
    public async getChildren() {
        let keyLisWithPrefix = await this.getKeyList()
        return RedisFolderNode.buildChilds(this, keyLisWithPrefix)
        return []
    }

    // 获取redis的文件夹或者key列表
    // 这里folderNode与keyNode公用一个获取子级方法，是因为实际上redis里floder是从key的同一前缀而衍生的概念。
    public static buildChilds(parent: RedisBaseNode, keys: string[]) {
        // 如果没有数据显示一个InfoNode节点
        if (!keys) return [new InfoNode('no data')];
        const prefixMap: { [key: string]: string[] } = {}
        if (parent.level <= 2) {
            for (const key of keys.sort()) {
                // 获取key的前缀也就是folder，parent.parent.level=0.
                let prefix = key.split(":")[parent.level - 1];

                // 将key按照前缀分组
                if (!prefixMap[prefix]) prefixMap[prefix] = []
                prefixMap[prefix].push(key)
            }   
        }
        // Console.log(JSON.stringify(prefixMap))

        return Object.keys(prefixMap).map((prefix: string) => {
            if (prefixMap[prefix].length > 1) {
                return new RedisFolderNode(prefix, prefixMap[prefix], parent)
            } else {
                return new KeyNode(prefixMap[prefix][0], prefix, parent)
            }
        })
    }

    public async delete() {
        Util.confirm(`Are you sure you want to delete folder ${this.label} ? `, async () => {
            const client = await this.getClient();
            for (const child of this.childens) {
                await client.del(child) 
            }
            this.provider.reload()
        })
    }

}

