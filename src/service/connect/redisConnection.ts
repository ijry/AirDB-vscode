import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";
import * as fs from "fs";
import IoRedis from "ioredis";
import { Console } from "../../common/Console";

export class RedisConnection extends IConnection {
    private conneted: boolean;
    private client: IoRedis.Redis;
    constructor(node: Node) {
        super()
        let config = {
            port: node.port,
            host: node.host,
            password: node.password,
            connectTimeout: node.connectTimeout || 5000,
            db: node.database as any as number,
            family: 4,
        }as IoRedis.RedisOptions;
        if(node.useSSL){
            config.tls={
                rejectUnauthorized: false,
                ca: (node.caPath) ? fs.readFileSync(node.caPath) : null,
                cert: ( node.clientCertPath) ? fs.readFileSync(node.clientCertPath) : null,
                key: ( node.clientKeyPath) ? fs.readFileSync(node.clientKeyPath) : null,
                minVersion: 'TLSv1'
            }
        }
        // Console.log(config)
        this.client = new IoRedis(config);
    }
    query(sql: string, callback?: queryCallback): void;
    query(sql: string, values: any, callback?: queryCallback): void;
    query(sql: any, values?: any, callback?: any) {
        const param: string[] = sql.replace(/ +/g, " ").split(' ')
        const command = param.shift()
        this.client.send_command(command, param, callback)
    }
    run(callback: (client: IoRedis.Redis) => void) {

        callback(this.client)
    }

    connect(callback: (err: Error) => void): void {
        Console.log('start connect redis')
        let timeout = true;
        setTimeout(() => {
            if (timeout) {
                timeout = false;
                callback(new Error("Connect to redis server time out."))
            }
        }, 5000);
        this.client.ping((err) => {
            if (timeout) {
                this.conneted = true;
                timeout = false;
                // Console.log('连接' + JSON.stringify(err))
                callback(err)
            }
        })
    }
    beginTransaction(callback: (err: Error) => void): void {
    }
    rollback(): void {
    }
    commit(): void {
    }
    end(): void {
    }
    isAlive(): boolean {
        return this.conneted;
    }

}