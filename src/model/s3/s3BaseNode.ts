import { CodeCommand, ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import { S3Connection, formatS3Error } from "@/service/connect/s3Connection";
import { ConnectionManager } from "@/service/connectionManager";
import * as vscode from "vscode";

export abstract class S3BaseNode extends Node {
    protected getS3ConnectionNode(): Node {
        let current: Node = this;
        while (current.parent && current.contextValue != ModelType.S3_CONNECTION) {
            current = current.parent;
        }
        return current;
    }

    protected async getS3Connection(): Promise<S3Connection> {
        return await ConnectionManager.getConnection(this.getS3ConnectionNode()) as S3Connection;
    }

    protected infoOnError(operation: string, error: any): Node[] {
        return [new InfoNode(`${operation} failed: ${formatS3Error(error)}`)];
    }

    protected emptyInfo(): Node[] {
        return [new InfoNode(vscode.l10n.t("There are no files in this folder."))];
    }

    protected async refreshNode(node?: Node) {
        await vscode.commands.executeCommand(CodeCommand.Refresh, node || this);
    }

    protected async refreshParent() {
        await vscode.commands.executeCommand(CodeCommand.Refresh, this.parent || this);
    }
}
