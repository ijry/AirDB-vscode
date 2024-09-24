"use strict";

import * as vscode from "vscode";
import { CodeCommand } from "./common/constants";
import { ConnectionNode } from "./model/database/connectionNode";
import { SchemaNode } from "./model/database/schemaNode";
import { UserGroup } from "./model/database/userGroup";
import { CopyAble } from "./model/interface/copyAble";
import { FunctionNode } from "./model/main/function";
import { FunctionGroup } from "./model/main/functionGroup";
import { ProcedureNode } from "./model/main/procedure";
import { ProcedureGroup } from "./model/main/procedureGroup";
import { TableGroup } from "./model/main/tableGroup";
import { TableNode } from "./model/main/tableNode";
import { TriggerNode } from "./model/main/trigger";
import { TriggerGroup } from "./model/main/triggerGroup";
import { ViewGroup } from "./model/main/viewGroup";
import { ViewNode } from "./model/main/viewNode";
import { ColumnNode } from "./model/other/columnNode";
import { Console } from "./common/Console";
// Don't change last order, it will occur circular reference
import { ServiceManager } from "./service/serviceManager";
import { QueryUnit } from "./service/queryUnit";
import { FileManager } from "./common/filesManager";
import { ConnectionManager } from "./service/connectionManager";
import { QueryNode } from "./model/query/queryNode";
import { QueryGroup } from "./model/query/queryGroup";
import { Node } from "./model/interface/node";
import { DbTreeDataProvider } from "./provider/treeDataProvider";
import { UserNode } from "./model/database/userNode";
import { EsConnectionNode } from "./model/es/model/esConnectionNode";
import { ESIndexNode } from "./model/es/model/esIndexNode";
import { activeEs } from "./model/es/provider/main";
import { RedisConnectionNode } from "./model/redis/redisConnectionNode";
import KeyNode from "./model/redis/keyNode";
import { DiffService } from "./service/diff/diffService";
import { DatabaseCache } from "./service/common/databaseCache";
import { FileNode } from "./model/ssh/fileNode";
import { SSHConnectionNode } from "./model/ssh/sshConnectionNode";
import { FTPFileNode } from "./model/ftp/ftpFileNode";
import { HistoryNode } from "./provider/history/historyNode";
import { ConnectService } from "./service/connect/connectService";

export function activate(context: vscode.ExtensionContext) {

    const serviceManager = new ServiceManager(context)

    activeEs(context)

    ConnectionNode.init()
    context.subscriptions.push(
        ...serviceManager.init(),
        vscode.window.onDidChangeActiveTextEditor(detectActive),
        ConnectService.listenConfig(),
        ...initCommand({
            // util
            ...{
                [CodeCommand.Refresh]: async (node: Node) => {
                    if (node) {
                        await node.getChildren(true)
                    } else {
                        DatabaseCache.clearCache()
                    }
                    DbTreeDataProvider.refresh(node)
                },
                [CodeCommand.RecordHistory]: (sql: string, costTime: number) => {
                    serviceManager.historyService.recordHistory(sql, costTime);
                },
                "airdb.history.open": () => serviceManager.historyService.showHistory(),
                "airdb.setting.open": () => {
                    serviceManager.settingService.open();
                },
                "airdb.server.info": (connectionNode: ConnectionNode) => {
                    serviceManager.statusService.show(connectionNode)
                },
                "airdb.name.copy": (copyAble: CopyAble) => {
                    copyAble.copyName();
                },
            },
            ...{
                "airdb.user.center": () => {
                    serviceManager.userCenterService.openPage(serviceManager.provider)
                },
            },
            // connection
            ...{
                "airdb.connection.hideName": () => {
                    serviceManager.userCenterService.hideName(serviceManager.provider)
                },
                "airdb.connection.add": () => {
                    serviceManager.connectService.openConnect(serviceManager.provider)
                },
                "airdb.connection.edit": (connectionNode: ConnectionNode) => {
                    serviceManager.connectService.openConnect(connectionNode.provider, connectionNode)
                },
                "airdb.connection.config": () => {
                    serviceManager.connectService.openConfig()
                },
                "airdb.connection.open": (connectionNode: ConnectionNode) => {
                    connectionNode.provider.openConnection(connectionNode)
                },
                "airdb.connection.disable": (connectionNode: ConnectionNode) => {
                    connectionNode.provider.disableConnection(connectionNode)
                },
                "airdb.connection.delete": (connectionNode: ConnectionNode) => {
                    connectionNode.deleteConnection(context);
                },
                "airdb.host.copy": (connectionNode: ConnectionNode) => {
                    connectionNode.copyName();
                },
            },
            // externel data
            ...{
                "airdb.util.github": () => {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/ijry/airdb'));
                },
                "airdb.struct.diff": () => {
                    new DiffService().startDiff(serviceManager.provider);
                },
                "airdb.data.export": (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).dump(node, true)
                },
                "airdb.struct.export": (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).dump(node, false)
                },
                "airdb.document.generate": (node: SchemaNode | TableNode) => {
                    ServiceManager.getDumpService(node.dbType).generateDocument(node)
                },
                "airdb.data.import": (node: SchemaNode | ConnectionNode) => {
                    const importService=ServiceManager.getImportService(node.dbType);
                    vscode.window.showOpenDialog({ filters: importService.filter(), canSelectMany: false, openLabel: "Select sql file to import", canSelectFiles: true, canSelectFolders: false }).then((filePath) => {
                        if (filePath) {
                            importService.importSql(filePath[0].fsPath, node)
                        }
                    });
                },
            },
            // ssh
            ...{
                "airdb.ssh.folder.new": (parentNode: SSHConnectionNode) => parentNode.newFolder(),
                "airdb.ssh.file.new": (parentNode: SSHConnectionNode) => parentNode.newFile(),
                "airdb.ssh.host.copy": (parentNode: SSHConnectionNode) => parentNode.copyIP(),
                "airdb.ssh.forward.port": (parentNode: SSHConnectionNode) => parentNode.fowardPort(),
                "airdb.ssh.file.upload": (parentNode: SSHConnectionNode) => parentNode.upload(),
                "airdb.ssh.folder.open": (parentNode: SSHConnectionNode) => parentNode.openInTeriminal(),
                "airdb.ssh.path.copy": (node: Node) => node.copyName(),
                "airdb.ssh.socks.port": (parentNode: SSHConnectionNode) => parentNode.startSocksProxy(),
                "airdb.ssh.file.delete": (fileNode: FileNode | SSHConnectionNode) => fileNode.delete(),
                "airdb.ssh.file.open": (fileNode: FileNode | FTPFileNode) => fileNode.open(),
                "airdb.ssh.file.download": (fileNode: FileNode) => fileNode.download(),
            },
            // database
            ...{
                "airdb.db.active": () => {
                    serviceManager.provider.activeDb();
                },
                "airdb.db.truncate": (databaseNode: SchemaNode) => {
                    databaseNode.truncateDb();
                },
                "airdb.database.add": (connectionNode: ConnectionNode) => {
                    connectionNode.createDatabase();
                },
                "airdb.db.drop": (databaseNode: SchemaNode) => {
                    databaseNode.dropDatatabase();
                }
            },
            // mock
            ...{
                "airdb.mock.table": (tableNode: TableNode) => {
                    serviceManager.mockRunner.create(tableNode)
                },
                "airdb.mock.run": () => {
                    serviceManager.mockRunner.runMock()
                },
            },
            // user node
            ...{
                "airdb.change.user": (userNode: UserNode) => {
                    userNode.changePasswordTemplate();
                },
                "airdb.user.grant": (userNode: UserNode) => {
                    userNode.grandTemplate();
                },
                "airdb.user.sql": (userNode: UserNode) => {
                    userNode.selectSqlTemplate();
                },
            },
            // history
            ...{
                "airdb.history.view": (historyNode: HistoryNode) => {
                    historyNode.view()
                }
            },
            // query node
            ...{
                "airdb.runQuery": (sql:string) => {
                    if (typeof sql != 'string') { sql = null; }
                    QueryUnit.runQuery(sql, ConnectionManager.tryGetConnection());
                },
                "airdb.runAllQuery": () => {
                    QueryUnit.runQuery(null, ConnectionManager.tryGetConnection(), { runAll: true });
                },
                "airdb.query.switch": async (databaseOrConnectionNode: SchemaNode | ConnectionNode | EsConnectionNode | ESIndexNode) => {
                    if (databaseOrConnectionNode) {
                        await databaseOrConnectionNode.newQuery();
                    } else {
                        vscode.workspace.openTextDocument({ language: 'sql' }).then(async (doc) => {
                            vscode.window.showTextDocument(doc)
                        });
                    }
                },
                "airdb.query.run": (queryNode: QueryNode) => {
                    queryNode.run()
                },
                "airdb.query.open": (queryNode: QueryNode) => {
                    queryNode.open()
                },
                "airdb.query.add": (queryGroup: QueryGroup) => {
                    queryGroup.add();
                },
                "airdb.query.rename": (queryNode: QueryNode) => {
                    queryNode.rename()
                }
            },
            // redis
            ...{
                "airdb.redis.connection.status": (connectionNode: RedisConnectionNode) => connectionNode.showStatus(),
                "airdb.connection.terminal": (node: Node) => node.openTerminal(),
                "airdb.redis.key.detail": (keyNode: KeyNode) => keyNode.detail(),
                "airdb.redis.key.del": (keyNode: KeyNode) => keyNode.delete(),
            },
            // table node
            ...{
                "airdb.show.esIndex": (indexNode: ESIndexNode) => {
                    indexNode.viewData()
                },
                "airdb.table.truncate": (tableNode: TableNode) => {
                    tableNode.truncateTable();
                },
                "airdb.table.drop": (tableNode: TableNode) => {
                    tableNode.dropTable();
                },
                "airdb.table.source": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.showSource(); }
                },
                "airdb.view.source": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.showSource(); }
                },
                // 在新的面板打开表数据页面
                "airdb.table.show": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.openInNew(); }
                },
                // 表置顶
                "airdb.table.pin": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.pin(tableNode); }
                },
                // 取消表置顶
                "airdb.table.unpin": (tableNode: TableNode) => {
                    if (tableNode) { tableNode.unpin(tableNode); }
                }
            },
            // column node
            ...{
                "airdb.column.up": (columnNode: ColumnNode) => {
                    columnNode.moveUp();
                },
                "airdb.column.down": (columnNode: ColumnNode) => {
                    columnNode.moveDown();
                },
                "airdb.column.add": (tableNode: TableNode) => {
                    tableNode.addColumnTemplate();
                },
                "airdb.column.update": (columnNode: ColumnNode) => {
                    columnNode.updateColumnTemplate();
                },
                "airdb.column.drop": (columnNode: ColumnNode) => {
                    columnNode.dropColumnTemplate();
                },
            },
            // template
            ...{
                "airdb.table.find": (tableNode: TableNode) => {
                    // tableNode.openTable();
                    // 在新TAB打开
                    tableNode.openInNew();
                },
                "airdb.codeLens.run": (sql: string) => {
                    QueryUnit.runQuery(sql, ConnectionManager.tryGetConnection(), { split: true, recordHistory: true })
                },
                "airdb.table.design": (tableNode: TableNode) => {
                    tableNode.designTable();
                },
            },
            // show source
            ...{
                "airdb.show.procedure": (procedureNode: ProcedureNode) => {
                    procedureNode.showSource();
                },
                "airdb.show.function": (functionNode: FunctionNode) => {
                    functionNode.showSource();
                },
                "airdb.show.trigger": (triggerNode: TriggerNode) => {
                    triggerNode.showSource();
                },
            },
            // create template
            ...{
                "airdb.template.sql": (tableNode: TableNode) => {
                    tableNode.selectSqlTemplate();
                },
                "airdb.template.table": (tableGroup: TableGroup) => {
                    tableGroup.createTemplate();
                },
                "airdb.template.procedure": (procedureGroup: ProcedureGroup) => {
                    procedureGroup.createTemplate();
                },
                "airdb.template.view": (viewGroup: ViewGroup) => {
                    viewGroup.createTemplate();
                },
                "airdb.template.trigger": (triggerGroup: TriggerGroup) => {
                    triggerGroup.createTemplate();
                },
                "airdb.template.function": (functionGroup: FunctionGroup) => {
                    functionGroup.createTemplate();
                },
                "airdb.template.user": (userGroup: UserGroup) => {
                    userGroup.createTemplate();
                },
            },
            // drop template
            ...{
                "airdb.delete.user": (userNode: UserNode) => {
                    userNode.drop();
                },
                "airdb.delete.view": (viewNode: ViewNode) => {
                    viewNode.drop();
                },
                "airdb.delete.procedure": (procedureNode: ProcedureNode) => {
                    procedureNode.drop();
                },
                "airdb.delete.function": (functionNode: FunctionNode) => {
                    functionNode.drop();
                },
                "airdb.delete.trigger": (triggerNode: TriggerNode) => {
                    triggerNode.drop();
                },
            },
        }),
    );

}

export function deactivate() {
}

function detectActive(): void {
    const fileNode = ConnectionManager.getByActiveFile();
    if (fileNode) {
        ConnectionManager.changeActive(fileNode);
    }
}

function commandWrapper(commandDefinition: any, command: string): (...args: any[]) => any {
    return (...args: any[]) => {
        try {
            commandDefinition[command](...args);
        }catch (err) {
            Console.log(err);
        }
    };
}

function initCommand(commandDefinition: any): vscode.Disposable[] {

    const dispose = []

    for (const command in commandDefinition) {
        if (commandDefinition.hasOwnProperty(command)) {
            dispose.push(vscode.commands.registerCommand(command, commandWrapper(commandDefinition, command)))
        }
    }

    return dispose;
}


// refrences
// - when : https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts