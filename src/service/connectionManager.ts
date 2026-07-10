import * as path from "path";
import * as vscode from "vscode";
import { Global } from "../common/global";
import { Node } from "../model/interface/node";
import { QueryUnit } from "./queryUnit";
import { SSHConfig } from "../model/interface/sshConfig";
import { DatabaseCache } from "./common/databaseCache";
import { NodeUtil } from "../model/nodeUtil";
import { SSHTunnelService } from "./tunnel/sshTunnelService";
import { DbTreeDataProvider } from "../provider/treeDataProvider";
import { IConnection } from "./connect/connection";
import { DatabaseType } from "@/common/constants";
import { EsConnection } from "./connect/esConnection";
import { MSSqlConnnection } from "./connect/mssqlConnection";
import { MysqlConnection } from "./connect/mysqlConnection";
import { OracleConnection } from "./connect/oracleConnection";
import { PostgreSqlConnection } from "./connect/postgreSqlConnection";
import { RedshiftConnection } from "./connect/redshiftConnection";
import { SnowflakeConnection } from "./connect/snowflakeConnection";
import { RedisConnection } from "./connect/redisConnection";
import { FTPConnection } from "./connect/ftpConnection";
import { SqliteConnection } from "./connect/sqliteConnection";
import { Console } from "@/common/Console";
import { MongoConnection } from "./connect/mongoConnection";
import { KingbaseConnection } from "./connect/kingbaseConnection";
import { DamengConnection } from "./connect/damengConnection";
import { KafkaConnection } from "./connect/kafkaConnection";
import { ClickHouseConnection } from "./connect/clickHouseConnection";
import { DorisConnection } from "./connect/dorisConnection";
import { TDengineConnection } from "./connect/tdengineConnection";
import { DuckDBConnection } from "./connect/duckdbConnection";
import { RabbitMQConnection } from "./connect/rabbitmqConnection";
import { S3Connection } from "./connect/s3Connection";

interface ConnectionWrapper {
    connection: IConnection;
    ssh: SSHConfig;
    schema?: string
}

export interface GetRequest {
    retryCount?: number;
    sessionId?: string;
}

export class ConnectionManager {

    public static activeNode: Node;
    private static alivedConnection: { [key: string]: ConnectionWrapper } = {};
    private static tunnelService = new SSHTunnelService();

    public static tryGetConnection(): Node {

        return this.getByActiveFile() || this.activeNode;
    }

    public static getActiveConnectByKey(key: string): ConnectionWrapper {
        return this.alivedConnection[key]
    }

    public static removeConnection(uid: string) {

        try {
            const lcp = this.activeNode;
            if (lcp?.getConnectId() == uid) {
                delete this.activeNode
            }
            const activeConnect = this.alivedConnection[uid];
            if (activeConnect) {
                this.end(uid, activeConnect)
            }
            DatabaseCache.clearDatabaseCache(uid)
        } catch (error) {
            Console.log(error)
        }

    }

    public static changeActive(connectionNode: Node) {
        this.activeNode = connectionNode;
        Global.updateStatusBarItems(connectionNode);
        DbTreeDataProvider.refresh()
    }

    public static getConnection(connectionNode: Node, getRequest: GetRequest = { retryCount: 1 }): Promise<IConnection> {
        if (!connectionNode) {
            throw new Error(vscode.l10n.t("Connection is dead!"))
        }
        Console.log(`get connection ${connectionNode.getConnectId()}`)
        return new Promise(async (resolve, reject) => {

            NodeUtil.of(connectionNode)
            if (!getRequest.retryCount) getRequest.retryCount = 1;
            const key = getRequest.sessionId || connectionNode.getConnectId();
            const connection = this.alivedConnection[key];
            if (connection) {
                if (connection.connection.isAlive()) {
                    // Console.log("&&&&&&&&&&&&&"+connection.schema + connectionNode.schema)
                    if (connection.schema != connectionNode.schema) {
                        const sql = connectionNode?.dialect?.pingDataBase(connectionNode.schema);
                        try {
                            if (sql) {
                                await QueryUnit.queryPromise(connection.connection, sql, false)
                            }
                            connection.schema = connectionNode.schema
                            resolve(connection.connection);
                            return;
                        } catch (err) {
                            ConnectionManager.end(key, connection);
                        }
                    } else {
                        resolve(connection.connection);
                        return;
                    }
                }
            }

            const ssh = connectionNode.ssh;
            let connectOption = connectionNode;
            if (connectOption.usingSSH) {
                connectOption = await this.tunnelService.createTunnel(connectOption, (err) => {
                    reject(err?.message || err?.errno);
                    if (err.errno == 'EADDRINUSE') { return; }
                    this.alivedConnection[key] = null
                })
                if (!connectOption) {
                    reject(vscode.l10n.t("create ssh tunnel fail!"));
                    return;
                }
            }
            const newConnection = this.create(connectOption);

            this.alivedConnection[key] = { connection: newConnection, ssh };
            newConnection.connect(async (err: Error) => {
                if (err) {
                    // Console.log('s111')
                    this.end(key, this.alivedConnection[key])
                    reject(err)
                } else {
                    // Console.log('s222')
                    try {
                        if (connectionNode?.dialect) {
                            const sql = connectionNode?.dialect?.pingDataBase(connectionNode.schema);
                            if (connectionNode.schema && sql) {
                                await QueryUnit.queryPromise(newConnection, sql, false)
                            }
                        }
                    } catch (error) {
                        Console.log(err)
                    }
                    resolve(newConnection);
                }
            });

        });

    }

    private static create(opt: Node) {
        // if (!opt.dbType) opt.dbType = DatabaseType.MYSQL
        switch (opt.dbType) {
            case DatabaseType.MYSQL:
                return new MysqlConnection(opt)
            case DatabaseType.MSSQL:
                return new MSSqlConnnection(opt)
            case DatabaseType.PG:
                return new PostgreSqlConnection(opt)
            case DatabaseType.REDSHIFT:
                return new RedshiftConnection(opt)
            case DatabaseType.SNOWFLAKE:
                return new SnowflakeConnection(opt)
            case DatabaseType.KINGBASE:
                return new KingbaseConnection(opt)
            case DatabaseType.DAMENG:
                return new DamengConnection(opt)
            case DatabaseType.ORACLE:
                return new OracleConnection(opt);
            case DatabaseType.SQLITE:
                return new SqliteConnection(opt);
            case DatabaseType.CLICKHOUSE:
                return new ClickHouseConnection(opt);
            case DatabaseType.DORIS:
                return new DorisConnection(opt);
            case DatabaseType.TDENGINE:
                return new TDengineConnection(opt);
            case DatabaseType.DUCKDB:
                return new DuckDBConnection(opt);
            case DatabaseType.ES:
                return new EsConnection(opt);
            case DatabaseType.MONGO_DB:
                return new MongoConnection(opt);
            case DatabaseType.REDIS:
                // Console.log('redisredis')
                return new RedisConnection(opt);
            case DatabaseType.KAFKA:
                return new KafkaConnection(opt);
            case DatabaseType.RABBITMQ:
                return new RabbitMQConnection(opt);
            case DatabaseType.S3:
                return new S3Connection(opt);
            case DatabaseType.FTP:
                return new FTPConnection(opt);
            default:
                Console.log('创建连接出错' + JSON.stringify(opt))
                throw new Error(vscode.l10n.t('no dbType'))
        }
    }

    private static end(key: string, connection: ConnectionWrapper) {
        this.alivedConnection[key] = null
        try {
            this.tunnelService.closeTunnel(key)
            connection.connection.end();
        } catch (error) {
        }
    }

    public static getByActiveFile(): Node {
        if (vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            if (fileName.includes('jry.airdb')) {
                const queryName = path.basename(path.resolve(fileName, '..'))
                const [host, port, database, schema] = queryName
                    .replace(/^.*@@/, '') // new connection id
                    .replace(/#.+$/, '').split('@')
                if (host != null) {
                    const node = NodeUtil.of({ key: queryName.split('@@')[0], host, port: parseInt(port), database, schema });
                    if (node.getCache()) {
                        return node.getCache();
                    }
                }
            }
        }
        return null;
    }

}
