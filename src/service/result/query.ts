import { FieldInfo } from "@/common/typeDef";
import { Util } from "@/common/util";
import { EsRequest } from "@/model/es/esRequest";
import { ServiceManager } from "@/service/serviceManager";
import { basename, extname } from "path";
import { env, Uri, ViewColumn, window } from "vscode";
import { Trans } from "@/common/trans";
import { ConfigKey, DatabaseType, MessageType, ModelType } from "../../common/constants";
import { Global } from "../../common/global";
import { ViewManager } from "../../common/viewManager";
import { Node } from "../../model/interface/node";
import { ColumnNode } from "../../model/other/columnNode";
import { ExportService } from "../export/exportService";
import { QueryOption, QueryUnit } from "../queryUnit";
import { DataResponse } from "./queryResponse";
import * as vscode from 'vscode';
import { Console } from "@/common/Console";
import { TableNode } from "@/model/main/tableNode";

export class QueryParam<T> {
    public connection: Node;
    public singlePage?: boolean;
    public type: MessageType;
    public res: T;
    public queryOption?: QueryOption;
}

export class QueryPage {

    private static exportService: ExportService = new ExportService()

    public static async send(queryParam: QueryParam<any>) {

        const dbOption: Node = queryParam.connection;
        await QueryPage.adaptData(queryParam);
        const type = this.keepSingle(queryParam);
        // Console.log('&&&&'+ type)

        ViewManager.createWebviewPanel({
            singlePage: true,
            splitView: this.isActiveSql(queryParam.queryOption),
            path: 'result', title: vscode.l10n.t('Query'), type,
            iconPath: Global.getExtPath("resources", "icon", "query.svg"),
            eventHandler: async (handler) => {
                handler.on("init", () => {
                    if (queryParam.res?.table) {
                        handler.panel.title = queryParam.res.table;
                    }
                    queryParam.res.transId = Trans.transId;
                    queryParam.res.viewId = queryParam.queryOption?.viewId;
                    handler.emit(queryParam.type, {
                        ...queryParam.res, dbType: dbOption.dbType,
                        showOpenDesignBtn: dbOption.contextValue == ModelType.TABLE // 是否显示表结构按钮
                    })
                }).on('execute', (params) => {
                    QueryUnit.runQuery(params.sql, dbOption, queryParam.queryOption);
                }).on('next', async (params) => {
                    const executeTime = new Date().getTime();
                    const sql = ServiceManager.getPageService(dbOption.dbType).build(params.sql, params.pageNum, params.pageSize)
                    dbOption.execute(sql).then((rows) => {
                        const costTime = new Date().getTime() - executeTime;
                        handler.emit(MessageType.NEXT_PAGE, { sql, data: rows ,costTime})
                    })
                }).on("full", () => {
                    handler.panel.reveal(ViewColumn.One)
                }).on('esFilter', (query) => {
                    const esQuery = EsRequest.build(queryParam.res.sql, obj => {
                        obj.query = query;
                    })
                    QueryUnit.runQuery(esQuery, dbOption, queryParam.queryOption);
                }).on('esSort', (sort) => {
                    const esQuery = EsRequest.build(queryParam.res.sql, obj => {
                        obj.sort = sort;
                    })
                    QueryUnit.runQuery(esQuery, dbOption, queryParam.queryOption);
                }).on('copy', value => {
                    Util.copyToBoard(value)
                }).on('count', async (params) => {
                    if (dbOption.dbType == DatabaseType.MONGO_DB) {
                        const sql = params.sql.replace(/(.+?find\(.+?\)).+/i, '$1').replace("find", "count");
                        dbOption.execute(sql).then((count) => {
                            handler.emit('COUNT', { data: count })
                        })
                    } else {
                        dbOption.execute(params.sql.replace(/\bSELECT\b.+?\bFROM\b/i, 'select count(*) count from')).then((rows) => {
                            handler.emit('COUNT', { data: rows[0].count })
                        })
                    }
                }).on('export', (params) => {
                    this.exportService.export({ ...params.option, request: queryParam.res.request, dbOption }).then(() => {
                        handler.emit('EXPORT_DONE')
                    })
                }).on('changePageSize', (pageSize) => {
                    Global.updateConfig(ConfigKey.DEFAULT_LIMIT, pageSize)
                }).on('openGithub', () => {
                    env.openExternal(Uri.parse('https://github.com/ijry/airdb'));
                }).on('openCoffee', () => {
                    env.openExternal(Uri.parse('https://www.buymeacoffee.com/ijry'));
                }).on('dataModify', () => {
                    if (handler.panel.title.indexOf("*") == -1) handler.panel.title = `${handler.panel.title}*`
                }).on("saveModify", (sql) => {
                    dbOption.execute(sql).then(() => {
                        handler.emit('updateSuccess')
                        handler.panel.title = handler.panel.title.replace("*", "")
                    }).catch(err => {
                        handler.emit("updateFail", err)
                    })
                }).on('designTable', () => {
                    // 跳转表结构设计
                    // @ts-ignore
                    dbOption.designTable()
                })
            }
        });

    }

    private static async adaptData(queryParam: QueryParam<any>) {
        queryParam.res.sql = queryParam.res.sql;
        switch (queryParam.type) {
            case MessageType.DATA:
                if (queryParam.connection.dbType == DatabaseType.ES) {
                    await this.loadEsColumnList(queryParam);
                } else if (queryParam.connection.dbType == DatabaseType.MONGO_DB) {
                    await this.loadMongoColumnList(queryParam);
                } else {
                    await this.loadColumnList(queryParam);
                }
                const pageSize = ServiceManager.getPageService(queryParam.connection.dbType).getPageSize(queryParam.res.sql);
                ((queryParam.res) as DataResponse).pageSize = (queryParam.res.data?.length && queryParam.res.data.length > pageSize)
                    ? queryParam.res.data.length : pageSize;
                break;
            case MessageType.MESSAGE_BLOCK:
                queryParam.res.message = `EXECUTE SUCCESS !`;
                break;
            case MessageType.DML:
            case MessageType.DDL:
                queryParam.res.message = `EXECUTE SUCCESS: Affected ${queryParam.res.affectedRows} Rows.`;
                break;
            case MessageType.ERROR:
                queryParam.res.message = `EXECUTE FAIL: &nbsp;&nbsp;${queryParam.res.message}.`;
                break;
        }
    }

    private static keepSingle(queryParam: QueryParam<any>) {
        if (typeof queryParam.singlePage == 'undefined') {
            queryParam.singlePage = true;
        }
        if (!queryParam.queryOption) {
            queryParam.queryOption = {
                viewId: "Query"
            }
        }
        return queryParam.queryOption.viewId;
    }

    private static isActiveSql(option: QueryOption): boolean {

        if (!window.activeTextEditor || !window.activeTextEditor.document || option.split === false) { return false; }

        const extName = extname(window.activeTextEditor.document.fileName)?.toLowerCase()
        const fileName = basename(window.activeTextEditor.document.fileName)?.toLowerCase()

        return extName == '.sql' || fileName.match(/mock.json$/) != null || extName == '.es';
    }

    private static async loadEsColumnList(queryParam: QueryParam<DataResponse>) {
        const indexName = queryParam.res.sql.split(' ')[1].split('/')[1];
        queryParam.res.table = indexName
        // count, continue
        if (queryParam.res.fields.length == 1) {
            queryParam.res.columnList = queryParam.res.fields as any[]
            return;
        }
        queryParam.res.primaryKey = '_id'
        queryParam.res.tableCount = 1

        queryParam.res.columnList = queryParam.res.fields.slice(4) as any[]
    }

    private static async loadMongoColumnList(queryParam: QueryParam<DataResponse>) {
        const parse = queryParam.res.sql.match(/db\('(.+?)'\)\.collection\('(.+?)'\)/);
        queryParam.res.database = parse[1]
        queryParam.res.table = parse[2]
        queryParam.res.primaryKey = '_id'
        queryParam.res.tableCount = 1
        queryParam.res.columnList = queryParam.res.fields as any[]
    }

    private static async loadColumnList(queryParam: QueryParam<DataResponse>) {
        // fix null point on result view
        queryParam.res.columnList = []
        const sqlList = queryParam.res.sql.match(/(?<=\b(from|join)\b\s*)(\S+)/gi)
        if (!sqlList || sqlList.length == 0) {
            return;
        }

        let tableName = sqlList[0]
        let database: string;

        if (queryParam.connection.dbType == DatabaseType.MSSQL && tableName.indexOf(".") != -1) {
            tableName = tableName.split(".")[1]
        }

        // mysql直接从结果集拿
        const fields = queryParam.res.fields
        if (fields && fields[0]?.orgTable) {
            tableName = fields[0].orgTable;
            database = fields[0].schema || fields[0].db;
            queryParam.res.database = database;
        } else {
            tableName = tableName.replace(/^"?(.+?)"?$/, '$1')
        }

        const tableNode = queryParam.connection.getByRegion(tableName)
        if (tableNode) {
            let primaryKey: string;
            let primaryKeyList = [];
            const columnList = (await tableNode.getChildren()).map((columnNode: ColumnNode) => {
                if (columnNode.isPrimaryKey) {
                    primaryKey = columnNode.column.name;
                    primaryKeyList.push(columnNode.column)
                }
                return columnNode.column;
            });
            queryParam.res.primaryKey = primaryKey;
            queryParam.res.columnList = columnList;
            queryParam.res.primaryKeyList = primaryKeyList;
            // compatible sqlite empty result.
            if (queryParam.res.fields.length == 0) {
                queryParam.res.fields = columnList as any as FieldInfo[];
            }
        }
        queryParam.res.tableCount = sqlList.length;
        queryParam.res.table = tableName;
    }

}