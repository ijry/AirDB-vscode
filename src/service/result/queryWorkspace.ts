import * as vscode from "vscode";
import { ConfigKey, MessageType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { ViewManager } from "@/common/viewManager";
import { Node } from "@/model/interface/node";
import { ExportService } from "@/service/export/exportService";
import { QueryUnit } from "@/service/queryUnit";
import { ServiceManager } from "@/service/serviceManager";

export interface QueryWorkspaceMessage {
    type: MessageType | string;
    content: any;
}

export class QueryWorkspacePage {
    private static exportService: ExportService = new ExportService();

    public static async open(connection: Node, initialSql: string = "", message?: QueryWorkspaceMessage): Promise<void> {
        const viewId = `QueryWorkspace:${connection.getConnectId({ withSchema: true })}`;

        await ViewManager.createWebviewPanel({
            singlePage: true,
            splitView: false,
            path: "queryWorkspace",
            title: vscode.l10n.t("Query"),
            type: viewId,
            iconPath: Global.getExtPath("resources", "icon", "query.svg"),
            eventHandler: (handler) => {
                handler.on("init", () => {
                    if (message) {
                        handler.emit(message.type, {
                            ...message.content,
                            dbType: connection.dbType,
                            viewId,
                        });
                    } else {
                        handler.emit(MessageType.RUN, {
                            sql: initialSql,
                            dbType: connection.dbType,
                            viewId,
                        });
                    }
                }).on("execute", (params) => {
                    QueryUnit.runQuery(params.sql, connection, {
                        viewId,
                        split: false,
                        recordHistory: true,
                        viewMode: "workspace",
                    });
                }).on("next", async (params) => {
                    const executeTime = new Date().getTime();
                    const sql = ServiceManager.getPageService(connection.dbType).build(params.sql, params.pageNum, params.pageSize);
                    connection.execute(sql).then((rows) => {
                        const costTime = new Date().getTime() - executeTime;
                        handler.emit(MessageType.NEXT_PAGE, { sql, data: rows, costTime });
                    });
                }).on("export", (params) => {
                    this.exportService.export({ ...params.option, dbOption: connection }).then(() => {
                        handler.emit("EXPORT_DONE");
                    });
                }).on("changePageSize", (pageSize) => {
                    Global.updateConfig(ConfigKey.DEFAULT_LIMIT, pageSize);
                }).on("copy", value => {
                    Util.copyToBoard(value);
                });
            },
        });
    }
}
