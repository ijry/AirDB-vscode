"use strict";
import * as vscode from "vscode";
import { CodeCommand, MessageType } from "../common/constants";
import { Console } from "../common/Console";
import { FileManager, FileModel } from "../common/filesManager";
import { Node } from "../model/interface/node";
import { QueryPage } from "./result/query";
import { DataResponse, DMLResponse, ErrorResponse, MessageResponse, RunResponse } from "./result/queryResponse";
import { ConnectionManager } from "./connectionManager";
import { DelimiterHolder } from "./common/delimiterHolder";
import { ServiceManager } from "./serviceManager";
import { NodeUtil } from "@/model/nodeUtil";
import { Trans } from "@/common/trans";
import { IConnection } from "./connect/connection";
import { FieldInfo } from "@/common/typeDef";
import { Util } from "@/common/util";
import { SQLParser } from "@/provider/parser/sqlParser";

export class QueryUnit {

    public static queryPromise<T>(connection: IConnection, sql: string, showError = true): Promise<QueryResult<T>> {
        return new Promise((resolve, reject) => {
            connection.query(sql, (err: Error, rows, fields, total) => {
                if (err) {
                    if (showError) {
                        Console.log(`Execute sql fail : ${sql}`);
                        Console.log(err);
                    }
                    reject(err);
                } else {
                    resolve(({ rows, fields, total }));
                }
            });
        });
    }


    // airdb.runQuery查询数据
    public static async runQuery(sql: string, connectionNode: Node, queryOption: QueryOption = {}): Promise<void> {

        if (!connectionNode) {
            vscode.window.showErrorMessage(vscode.l10n.t("Not active database connection found!"))
            return;
        }

        Trans.begin()
        connectionNode = NodeUtil.of(connectionNode)
        if (queryOption.split == null)
            queryOption.split = (sql == null);

        if (!sql) {
            sql = this.getSqlFromEditor(connectionNode, queryOption.runAll);
            queryOption.recordHistory = true;
        }
        if (!sql) {
            vscode.window.showErrorMessage(vscode.l10n.t("Not sql found!"))
            return;
        }

        sql = sql.replace(/^\s*--.+/igm, '').trim();

        const parseResult = DelimiterHolder.parseBatch(sql, connectionNode.getConnectId())
        sql = parseResult.sql
        if (!sql && parseResult.replace) {
            QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE, queryOption,
                res: { message: vscode.l10n.t(`change delimiter success`), success: true } as MessageResponse });
            return;
        }

        // 分割sql为数组，如果不分割，当一个SQL文件中存在多个select语句时，查询结果展示页面只会展示最后一个。
        let sqlList2 = [''];
        let viewId = new Date().getTime();
        if (!queryOption.viewId) {
            let sqlList = sql.split(/;\s*/);
            let sqlDefault = '';
            sqlList.forEach(element => {
                if (element != '') {
                    if (sql.match(/select/i)) {
                        sqlList2.push(element + ";");
                    } else {
                        sqlList2[0] = sqlList2[0] + element + ";\n";
                    }
                }
            });
            // Console.log('sqlList')
            // Console.log(sqlList2)
        } else {
            sqlList2 = [sql];
        }
        sqlList2.forEach(async (sql, sqlIndex) => {
            if (sql != '') {
                // 打开一个页面
                let queryOptionCrt: QueryOption = {...queryOption};
                if (!queryOptionCrt.viewId) {
                    if(sqlIndex == 0
                        || (sqlList2[0] == '' && sqlIndex == 1)
                    ) {
                        queryOptionCrt.viewId = 'Query'
                    } else {
                        queryOptionCrt.viewId = viewId + sqlIndex;
                    }
                }
                // Console.log('###################'+ queryOptionCrt.viewId)
                QueryPage.send({connection: connectionNode, type: MessageType.RUN, queryOption: queryOptionCrt, res: { sql } as RunResponse });

                let executeTime = new Date().getTime();
                try {
                    const connection = await ConnectionManager.getConnection(connectionNode)
                    connection.query(sql, (err: Error, data, fields, total) => {
                        if (err) {
                            QueryPage.send({ connection: connectionNode, type: MessageType.ERROR, queryOption: queryOptionCrt,
                                res: { sql, message: err.message } as ErrorResponse });
                            return;
                        }
                        let costTime = new Date().getTime() - executeTime;
                        if (queryOption.recordHistory) {
                            vscode.commands.executeCommand(CodeCommand.RecordHistory, sql, costTime);
                        }

                        if (sql.match(/(create|drop|alter)\s+(table|prcedure|FUNCTION|VIEW)/i)) {
                            vscode.commands.executeCommand(CodeCommand.Refresh);
                        }

                        if (data.affectedRows) {
                            QueryPage.send({ connection: connectionNode, type: MessageType.DML, queryOption: queryOptionCrt,
                                    res: { sql, costTime, affectedRows: data.affectedRows } as DMLResponse });
                            return;
                        }

                        // query result
                        if (Array.isArray(fields)) {
                            const isQuery = fields[0] != null && fields[0].name != undefined;
                            const isSqliteEmptyQuery = fields.length == 0 && sql.match(/\bselect\b/i);
                            const isMongoEmptyQuery = fields.length == 0 && sql.match(/\.collection\b/i);
                            if (isQuery || isSqliteEmptyQuery || isMongoEmptyQuery) {
                                QueryPage.send({ connection: connectionNode, type: MessageType.DATA, queryOption: queryOptionCrt,
                                    res: { sql, costTime, data, fields, total } as DataResponse });
                                return;
                            }
                        }

                        if (Array.isArray(data)) {
                            // mysql procedrue call result
                            const lastEle = data[data.length - 1]
                            if (data.length > 2 && Util.is(lastEle, 'ResultSetHeader') && Util.is(data[0], 'TextRow')) {
                                data = data[data.length - 2]
                                fields = fields[fields.length - 2] as any as FieldInfo[]
                                QueryPage.send({ connection: connectionNode, type: MessageType.DATA, queryOption: queryOptionCrt,
                                    res: { sql, costTime, data, fields, total } as DataResponse });
                                return;
                            }
                        }

                        QueryPage.send({ connection: connectionNode, type: MessageType.MESSAGE_BLOCK, queryOption: queryOptionCrt,
                            res: { sql, costTime, isInsert: sql.match(/\binsert\b/i) != null } as DMLResponse });

                    });
                } catch (error) {
                    console.log(error)
                }
            }
        });
    }
    public static runBatch(connection: IConnection, sqlList: string[]) {
        return new Promise((resolve, reject) => {
            connection.beginTransaction(async () => {
                try {
                    for (let sql of sqlList) {
                        sql = sql.trim()
                        if (!sql) { continue }
                        await this.queryPromise(connection, sql)
                    }
                    connection.commit()
                    resolve(true)
                } catch (err) {
                    connection.rollback()
                    reject(err)
                }
            })
        })

    }

    private static getSqlFromEditor(connectionNode: Node, runAll: boolean): string {
        if (!vscode.window.activeTextEditor) {
            throw new Error(vscode.l10n.t("No SQL file selected!"));

        }
        const editor = vscode.window.activeTextEditor;
        if (runAll) {
            return editor.document.getText()
        }

        const selection = editor.selection;
        if (!selection.isEmpty) {
            return editor.document.getText(selection);
        }

        return SQLParser.parseBlockSingle(editor.document, editor.selection.active)?.sql
    }

    public static async showSQLTextDocument(node: Node, sql: string, template = "template.sql", fileMode: FileModel = FileModel.WRITE): Promise<vscode.TextEditor> {

        const document = await vscode.workspace.openTextDocument(await FileManager.record(`${node.uid}/${template}`, sql, fileMode));
        return await vscode.window.showTextDocument(document);
    }

}



export interface QueryResult<T> {
    rows: T; fields: FieldInfo[];
    total?: number;
}


export interface QueryOption {
    viewId?: any;
    split?: boolean;
    recordHistory?: boolean;
    /**
     * runAll if get sql from editor.
     */
    runAll?: boolean;
}