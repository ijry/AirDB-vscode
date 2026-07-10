import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { S3ListResult, formatS3Error } from "@/service/connect/s3Connection";
import * as path from "path";
import * as vscode from "vscode";
import { S3BaseNode } from "./s3BaseNode";
import { S3FolderNode } from "./s3FolderNode";
import { S3ObjectNode } from "./s3ObjectNode";

export class S3BucketNode extends S3BaseNode {
    public contextValue: string = ModelType.S3_BUCKET;
    public iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("database");

    constructor(readonly bucketName: string, parent: Node, private creationDate?: Date) {
        super(bucketName);
        this.init(parent);
        this.label = bucketName;
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        if (creationDate) this.description = creationDate.toISOString();
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getS3Connection();
            const result = await connection.listObjects(this.bucketName, "");
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
            const connection = await this.getS3Connection();
            await connection.uploadObject(this.bucketName, path.basename(targetPath), targetPath);
            vscode.window.showInformationMessage(`Upload ${path.basename(targetPath)} success.`);
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
            await connection.createFolder(this.bucketName, folder);
            await this.refreshNode();
        } catch (error) {
            vscode.window.showErrorMessage(`Create folder failed: ${formatS3Error(error)}`);
        }
    }
}
