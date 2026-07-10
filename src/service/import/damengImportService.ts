import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import { readFileSync } from "fs";
import * as vscode from "vscode";
import { ConnectionManager } from "../connectionManager";
import { QueryUnit } from "../queryUnit";
import { ImportService } from "./importService";
import { parseSqlScriptBatches } from "./sqlScriptBatchParser";

export class DamengImportService extends ImportService {
    public importSql(importPath: string, node: Node): void {
        const sql = readFileSync(importPath, "utf8");
        const batches = parseSqlScriptBatches(sql, "dameng");
        Util.process(vscode.l10n.t(`Importing sql file {0}`, importPath), async (done) => {
            const sessionId = `dameng_import_${new Date().getTime()}`;
            try {
                const connection = await ConnectionManager.getConnection(node, { sessionId });
                await QueryUnit.runBatch(connection, batches);
                vscode.window.showInformationMessage(`Import sql file ${importPath} success!`);
            } finally {
                ConnectionManager.removeConnection(sessionId);
                done();
            }
        });
    }
}
