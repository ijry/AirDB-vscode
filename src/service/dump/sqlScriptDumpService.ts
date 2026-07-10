import { Global } from "@/common/global";
import { ModelType } from "@/common/constants";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import { SchemaNode } from "@/model/database/schemaNode";
import { FunctionGroup } from "@/model/main/functionGroup";
import { ProcedureGroup } from "@/model/main/procedureGroup";
import { TableGroup } from "@/model/main/tableGroup";
import { TableNode } from "@/model/main/tableNode";
import { TriggerGroup } from "@/model/main/triggerGroup";
import { ViewGroup } from "@/model/main/viewGroup";
import { ViewNode } from "@/model/main/viewNode";
import { ConnectionManager } from "@/service/connectionManager";
import { QueryUnit } from "@/service/queryUnit";
import * as fs from "fs";
import * as vscode from "vscode";
import { DumpService } from "./dumpService";
import {
    appendRoutineTerminator,
    buildInsertStatement,
    SqlScriptDumpProfile,
} from "./sqlScriptDumpProfile";

export class SqlScriptDumpService extends DumpService {
    constructor(private readonly profile: SqlScriptDumpProfile) {
        super();
    }

    public async dump(node: Node, withData: boolean) {
        const items = await this.pickDumpItems(node);
        if (!items) {
            return;
        }

        const folderPath = await this.triggerSave(node);
        if (!folderPath) {
            return;
        }

        Util.process(vscode.l10n.t("Doing backup ") + `${node.host}_${node.schema}...`, (done) => {
            this.dumpSelectedData(node, folderPath.fsPath, withData, items)
                .then(() => {
                    vscode.window.showInformationMessage(
                        vscode.l10n.t(`Backup {0}_{1} success!`, node.getHost(), node.schema),
                        "open"
                    ).then((action) => {
                        if (action == "open") {
                            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(folderPath.fsPath));
                        }
                    });
                })
                .finally(done);
        });
    }

    private async pickDumpItems(node: Node): Promise<vscode.QuickPickItem[] | undefined> {
        if (node instanceof TableNode || node instanceof ViewNode) {
            return [{ label: node.table, description: node.contextValue }];
        }

        const tableList = await new TableGroup(node).getChildren();
        const childrenList = [...tableList];
        if (Global.getConfig("showView")) {
            childrenList.push(...(await new ViewGroup(node).getChildren()));
        }
        if (Global.getConfig("showProcedure")) {
            childrenList.push(...(await new ProcedureGroup(node).getChildren()));
        }
        if (Global.getConfig("showFunction")) {
            childrenList.push(...(await new FunctionGroup(node).getChildren()));
        }
        if (Global.getConfig("showTrigger")) {
            childrenList.push(...(await new TriggerGroup(node).getChildren()));
        }

        const pickItems = childrenList
            .filter((item) => item.contextValue != ModelType.INFO)
            .map((item) => ({ label: item.label, description: item.contextValue, picked: true }));
        return vscode.window.showQuickPick(pickItems, {
            canPickMany: true,
            matchOnDescription: true,
            ignoreFocusOut: true,
        });
    }

    private async dumpSelectedData(node: Node, dumpFilePath: string, withData: boolean, items: vscode.QuickPickItem[]): Promise<void> {
        fs.writeFileSync(dumpFilePath, "");
        const sessionId = `dump_${this.profile.name}_${new Date().getTime()}`;

        try {
            if (node instanceof SchemaNode) {
                fs.appendFileSync(dumpFilePath, `-- Schema: ${node.schema}\n\n`);
            }

            await this.dumpSources(node, sessionId, dumpFilePath, items, ModelType.TABLE, "table");
            await this.dumpSources(node, sessionId, dumpFilePath, items, ModelType.VIEW, "view");

            if (withData) {
                await this.dumpRows(node, sessionId, dumpFilePath, items);
            }

            await this.dumpSources(node, sessionId, dumpFilePath, items, ModelType.PROCEDURE, "procedure");
            await this.dumpSources(node, sessionId, dumpFilePath, items, ModelType.FUNCTION, "function");
            await this.dumpSources(node, sessionId, dumpFilePath, items, ModelType.TRIGGER, "trigger");
        } finally {
            ConnectionManager.removeConnection(sessionId);
        }
    }

    private async dumpSources(
        node: Node,
        sessionId: string,
        dumpFilePath: string,
        items: vscode.QuickPickItem[],
        modelType: ModelType,
        sourceType: "table" | "view" | "procedure" | "function" | "trigger"
    ): Promise<void> {
        const names = items.filter((item) => item.description == modelType).map((item) => item.label);
        for (const name of names) {
            const source = await this.loadSource(node, sessionId, sourceType, name);
            if (source) {
                fs.appendFileSync(dumpFilePath, `${source}\n\n`);
            }
        }
    }

    private async loadSource(
        node: Node,
        sessionId: string,
        sourceType: "table" | "view" | "procedure" | "function" | "trigger",
        name: string
    ): Promise<string> {
        try {
            const sql = this.sourceSql(node, sourceType, name);
            if (!sql) {
                return "";
            }
            const rows = await node.execute<any[]>(sql, sessionId);
            const row = rows && rows[0] ? rows[0] : {};
            const source = row["Create Table"]
                || row["Create View"]
                || row["Create Procedure"]
                || row["Create Function"]
                || row["SQL Original Statement"]
                || row.CREATE_SQL
                || "";
            return sourceType == "procedure" || sourceType == "function" || sourceType == "trigger"
                ? appendRoutineTerminator(this.profile, source)
                : `${String(source || "").trim().replace(/;+\s*$/, "")};`;
        } catch (err) {
            return "";
        }
    }

    private sourceSql(
        node: Node,
        sourceType: "table" | "view" | "procedure" | "function" | "trigger",
        name: string
    ): string {
        switch (sourceType) {
            case "table":
                return node.dialect.showTableSource(node.schema, name);
            case "view":
                return node.dialect.showViewSource(node.schema, name);
            case "procedure":
                return node.dialect.showProcedureSource(node.schema, name);
            case "function":
                return node.dialect.showFunctionSource(node.schema, name);
            case "trigger":
                return node.dialect.showTriggerSource(node.schema, name);
        }
    }

    private async dumpRows(node: Node, sessionId: string, dumpFilePath: string, items: vscode.QuickPickItem[]): Promise<void> {
        const tables = items.filter((item) => item.description == ModelType.TABLE).map((item) => item.label);
        for (const table of tables) {
            const sql = `SELECT * FROM ${this.profile.qualify(node.schema, table)}`;
            const result = await QueryUnit.queryPromise<any[]>(
                await ConnectionManager.getConnection(node, { sessionId }),
                sql
            );
            const rows = Array.isArray(result.rows) ? result.rows : [];
            if (rows.length) {
                fs.appendFileSync(dumpFilePath, `${buildInsertStatement(this.profile, node.schema, table, rows)}\n\n`);
            }
        }
    }
}
