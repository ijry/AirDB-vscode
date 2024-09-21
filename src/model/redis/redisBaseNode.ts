import { Node } from "@/model/interface/node";
import { RedisConnection } from "@/service/connect/redisConnection";
import { ConnectionManager } from "@/service/connectionManager";
import {Redis} from "ioredis";
import { Console } from "../../common/Console";

export default abstract class RedisBaseNode extends Node {
    pattern = "";
    level = 0;
    keyList = null;
    currentCursor = '0';
    currentTemp = {};
    pageLimit = 500;

    abstract getChildren(first?: boolean): Promise<Node[]>;

    // 获取Redis连接实例
    public async getClient(): Promise<Redis> {
        try {
            const redis = (await ConnectionManager.getConnection(this)) as RedisConnection
            return new Promise(res => { redis.run(res) })
        } catch (error) {
            Console.log('getClient出错' + JSON.stringify(error))
        }
    }

    // 根据pattern获取key列表
    async getKeyList() {
        let client = await this.getClient();
        // 切换数据库
        await client.select(parseInt(this.database))
        // 分页读取
        // 第一次遍历时，cursor 值为 0，然后将返回结果中第一个整数值作为下一次遍历的 cursor。
        let ret
        try {
            ret = await client.scan(
            this.currentCursor, "MATCH",
            this.pattern + "*", "COUNT", this.pageLimit
        );
        } catch (error) {
          Console.log(error)
        }
  
        // Console.log("getKeyList" + JSON.stringify(ret))
        this.currentCursor = ret[0] // 下一次游标值
        return ret[1];
      }

}