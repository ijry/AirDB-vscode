import { Node } from "@/model/interface/node";
import { RedisConnection } from "@/service/connect/redisConnection";
import { ConnectionManager } from "@/service/connectionManager";
import {Redis} from "ioredis";
import { Console } from "../../common/Console";

export default abstract class RedisBaseNode extends Node {
    pattern = "";
    level = 0;
    keyList = null;
    currentOffset = '0';
    currentTemp = {};
    pageLimit: 30;

    abstract getChildren(first?: boolean): Promise<Node[]>;

    async getKeyList() {
        let client = await this.getClient();
        // 分页读取
        let ret = await client.scan(
            this.currentOffset, "MATCH",
            this.pattern + "*", "COUNT", this.pageLimit
        );
        Console.log(JSON.stringify(ret))
        return this.currentOffset = ret[0], ret[1];
    }

    public async getClient(): Promise<Redis> {
        try {
            const redis = (await ConnectionManager.getConnection(this)) as RedisConnection
            console.log(JSON.stringify(redis))
            return new Promise(res => { redis.run(res) })
        } catch (error) {
            Console.log('getClient出错' + JSON.stringify(error))
        }
    }

}