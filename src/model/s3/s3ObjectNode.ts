import { Confirm, Constants, ModelType } from "@/common/constants";
import { FileManager, FileModel } from "@/common/filesManager";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import { S3ObjectSummary, formatS3Error } from "@/service/connect/s3Connection";
import * as path from "path";
import { extname } from "path";
import * as vscode from "vscode";
import { S3BaseNode } from "./s3BaseNode";

const prettyBytes = require("pretty-bytes");
const MAX_OPEN_BYTES = 10 * 1024 * 1024;
const BLOCKED_OPEN_EXTENSIONS = [".gz", ".exe", ".7z", ".jar", ".bin", ".tar"];

export class S3ObjectNode extends S3BaseNode {
    public contextValue: string = ModelType.S3_OBJECT;

    constructor(readonly bucketName: string, private object: S3ObjectSummary, parent: Node) {
        super(object.name);
        this.init(parent);
        this.label = object.name;
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this.description = `${prettyBytes(object.size || 0)}${object.lastModified ? ` ${object.lastModified.toISOString()}` : ""}`;
        this.tooltip = object.key;
        this.iconPath = this.getIcon(object.name);
        this.command = {
            command: "airdb.s3.object.open",
            arguments: [this],
            title: vscode.l10n.t("Open File"),
        };
    }

    public async getChildren(): Promise<Node[]> {
        return [];
    }

    public async open() {
        if ((this.object.size || 0) > MAX_OPEN_BYTES) {
            vscode.window.showErrorMessage(vscode.l10n.t("File size except 10 MB, not support open!"));
            return;
        }
        const extName = path.extname(this.object.name).toLowerCase();
        if (BLOCKED_OPEN_EXTENSIONS.includes(extName)) {
            vscode.window.showErrorMessage(vscode.l10n.t(`Not support open {0} file!`, extName));
            return;
        }
        try {
            const connection = await this.getS3Connection();
            const content = await connection.getObjectBuffer(this.bucketName, this.object.key, MAX_OPEN_BYTES);
            const tempPath = await FileManager.record(`temp/${this.object.name}`, content as any, FileModel.WRITE);
            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(tempPath));
        } catch (error) {
            vscode.window.showErrorMessage(`Open object failed: ${formatS3Error(error)}`);
        }
    }

    public async download() {
        const extName = extname(this.object.name)?.replace(".", "") || "*";
        const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(this.object.name), filters: { Type: [extName] }, saveLabel: "Select Download Path" });
        if (!uri) return;
        try {
            const connection = await this.getS3Connection();
            await connection.downloadObject(this.bucketName, this.object.key, uri.fsPath);
            vscode.window.showInformationMessage(`Download ${this.object.key} success.`, "Open").then((action) => {
                if (action) vscode.commands.executeCommand("vscode.open", uri);
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Download object failed: ${formatS3Error(error)}`);
        }
    }

    public async delete() {
        const choice = await vscode.window.showQuickPick([Confirm.YES, Confirm.NO], { canPickMany: false });
        if (choice !== Confirm.YES) return;
        try {
            const connection = await this.getS3Connection();
            await connection.deleteObject(this.bucketName, this.object.key);
            await this.refreshParent();
        } catch (error) {
            vscode.window.showErrorMessage(`Delete object failed: ${formatS3Error(error)}`);
        }
    }

    public async copyObject() {
        const targetBucketInput = await vscode.window.showInputBox({ prompt: "Target bucket", value: this.bucketName });
        const targetBucket = String(targetBucketInput || "").trim();
        if (!targetBucket) return;
        const targetKeyInput = await vscode.window.showInputBox({ prompt: "Target key", value: `${this.object.key}.copy` });
        const targetKey = String(targetKeyInput || "").trim();
        if (!targetKey) return;
        try {
            const connection = await this.getS3Connection();
            await connection.copyObject(this.bucketName, this.object.key, targetKey, targetBucket);
            vscode.window.showInformationMessage(`Copy object to ${targetBucket}/${targetKey} success.`);
        } catch (error) {
            vscode.window.showErrorMessage(`Copy object failed: ${formatS3Error(error)}`);
        }
    }

    public async createPresignedUrl() {
        const expiresInput = await vscode.window.showInputBox({ prompt: "Expires in seconds", value: "3600" });
        const expiresIn = parseInt(String(expiresInput || "3600"), 10);
        if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 604800) {
            vscode.window.showErrorMessage("Create presigned URL failed: expires seconds must be between 1 and 604800.");
            return;
        }
        try {
            const connection = await this.getS3Connection();
            const url = await connection.createPresignedGetUrl(this.bucketName, this.object.key, expiresIn);
            Util.copyToBoard(url);
            vscode.window.showInformationMessage("Presigned URL copied to clipboard.");
        } catch (error) {
            vscode.window.showErrorMessage(`Create presigned URL failed: ${formatS3Error(error)}`);
        }
    }

    public copyName(): void {
        Util.copyToBoard(this.object.key);
    }

    private getIcon(fileName: string): string {
        const extPath = `${Constants.RES_PATH}`;
        const ext = path.extname(fileName).replace(".", "").toLowerCase();
        let fileIcon;
        switch (ext) {
            case "pub": case "pem": fileIcon = "key.svg"; break;
            case "ts": fileIcon = "typescript.svg"; break;
            case "log": fileIcon = "log.svg"; break;
            case "sql": fileIcon = "sql.svg"; break;
            case "xml": fileIcon = "xml.svg"; break;
            case "html": fileIcon = "html.svg"; break;
            case "java": case "class": fileIcon = "java.svg"; break;
            case "js": case "map": fileIcon = "javascript.svg"; break;
            case "yml": case "yaml": fileIcon = "yaml.svg"; break;
            case "json": fileIcon = "json.svg"; break;
            case "sh": fileIcon = "console.svg"; break;
            case "cfg": case "conf": fileIcon = "settings.svg"; break;
            case "rar": case "zip": case "7z": case "gz": case "tar": fileIcon = "zip.svg"; break;
            default: fileIcon = "file.svg"; break;
        }
        return `${extPath}/ssh/${fileIcon}`;
    }
}
