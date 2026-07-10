import { Confirm, ModelType } from "@/common/constants";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import { S3ListResult, formatS3Error } from "@/service/connect/s3Connection";
import * as path from "path";
import * as vscode from "vscode";
import { S3BaseNode } from "./s3BaseNode";
import { S3ObjectNode } from "./s3ObjectNode";

export class S3FolderNode extends S3BaseNode {
    public contextValue: string = ModelType.S3_FOLDER;
    public iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("folder");

    constructor(readonly bucketName: string, readonly prefix: string, parent: Node) {
        super(prefix);
        this.init(parent);
        this.label = this.getDisplayName(prefix);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        this.description = prefix;
    }

    private getDisplayName(prefix: string): string {
        const trimmed = prefix.replace(/\/$/, "");
        const parts = trimmed.split("/").filter(Boolean);
        return parts.length ? `${parts[parts.length - 1]}/` : prefix;
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getS3Connection();
            const result = await connection.listObjects(this.bucketName, this.prefix);
            const children = this.buildChildren(result);
            return children.length ? children : this.emptyInfo();
        } catch (error) {
            return this.infoOnError("List objects", error);
        }
    }

    private buildChildren(result: S3ListResult): Node[] {
        const folders = result.prefixes
            .map((prefix) => new S3FolderNode(this.bucketName, prefix.prefix, this))
            .sort((a, b) => String(a.label).localeCompare(String(b.label)));
        const objects = result.objects
            .map((object) => new S3ObjectNode(this.bucketName, object, this))
            .sort((a, b) => String(a.label).localeCompare(String(b.label)));
        return ([] as Node[]).concat(folders).concat(objects);
    }

    public async upload() {
        const uri = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, canSelectFolders: false, openLabel: "Select Upload Path" });
        if (!uri || !uri[0]) return;
        try {
            const targetPath = uri[0].fsPath;
            const key = `${this.prefix}${path.basename(targetPath)}`;
            const connection = await this.getS3Connection();
            await connection.uploadObject(this.bucketName, key, targetPath);
            vscode.window.showInformationMessage(`Upload ${key} success.`);
            await this.refreshNode();
        } catch (error) {
            vscode.window.showErrorMessage(`Upload object failed: ${formatS3Error(error)}`);
        }
    }

    public async newFolder() {
        const input = await vscode.window.showInputBox({ prompt: "Folder name" });
        const folder = String(input || "").replace(/^\/+|\/+$/g, "");
        if (!folder) return;
        try {
            const connection = await this.getS3Connection();
            await connection.createFolder(this.bucketName, `${this.prefix}${folder}`);
            await this.refreshNode();
        } catch (error) {
            vscode.window.showErrorMessage(`Create folder failed: ${formatS3Error(error)}`);
        }
    }

    public async delete() {
        const choice = await vscode.window.showQuickPick([Confirm.YES, Confirm.NO], { canPickMany: false });
        if (choice !== Confirm.YES) return;
        try {
            const connection = await this.getS3Connection();
            await connection.deleteObject(this.bucketName, this.prefix);
            await this.refreshParent();
        } catch (error) {
            vscode.window.showErrorMessage(`Delete object failed: ${formatS3Error(error)}`);
        }
    }

    public copyName(): void {
        Util.copyToBoard(this.prefix);
    }
}
