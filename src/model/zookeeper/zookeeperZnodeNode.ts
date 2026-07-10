import { ModelType } from "@/common/constants";
import { FileManager, FileModel } from "@/common/filesManager";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import { joinZooKeeperPath } from "@/service/connect/zookeeperConnection";
import * as path from "path";
import * as vscode from "vscode";
import { ZooKeeperBaseNode } from "./zookeeperBaseNode";

const MAX_OPEN_BYTES = 1024 * 1024;

export class ZooKeeperZnodeNode extends ZooKeeperBaseNode {
    public contextValue: string = ModelType.ZOOKEEPER_ZNODE;
    public iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("symbol-field");

    constructor(public znodePath: string, readonly parent: Node) {
        super(labelFromPath(znodePath));
        this.init(parent);
        this.label = labelFromPath(znodePath);
        this.tooltip = znodePath;
        this.command = {
            command: "airdb.zookeeper.znode.open",
            arguments: [this],
            title: vscode.l10n.t("Open Znode Data"),
        };
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getZooKeeperConnection();
            const children = await connection.listChildren(this.znodePath);
            return children
                .sort((a, b) => a.localeCompare(b))
                .map((child) => new ZooKeeperZnodeNode(joinZooKeeperPath(this.znodePath, child), this));
        } catch (error) {
            return this.infoOnError("List ZooKeeper children", error);
        }
    }

    public async open() {
        try {
            const connection = await this.getZooKeeperConnection();
            const content = await connection.getData(this.znodePath);
            if (content.length > MAX_OPEN_BYTES) {
                vscode.window.showErrorMessage(vscode.l10n.t("Znode data is larger than 1 MB, not support open!"));
                return;
            }
            const text = content.toString("utf8");
            const fileName = this.previewFileName(text);
            const tempPath = await FileManager.record(`temp/zookeeper/${fileName}`, text, FileModel.WRITE);
            vscode.commands.executeCommand("vscode.open", vscode.Uri.file(tempPath));
        } catch (error) {
            vscode.window.showErrorMessage(`Open znode failed: ${this.formatError(error)}`);
        }
    }

    public copyName(): void {
        Util.copyToBoard(this.znodePath);
    }

    private previewFileName(content: string): string {
        const baseName = sanitizeFileName(labelFromPath(this.znodePath) || "root");
        const ext = path.extname(baseName);
        if (ext) return baseName;
        return `${baseName}${looksLikeJson(content) ? ".json" : ".txt"}`;
    }
}

function labelFromPath(znodePath: string): string {
    const normalized = String(znodePath || "/").replace(/\/+$/g, "") || "/";
    if (normalized === "/") return "/";
    return normalized.split("/").filter(Boolean).pop() || normalized;
}

function sanitizeFileName(value: string): string {
    return String(value || "znode").replace(/[\\/:*?"<>|]/g, "_");
}

function looksLikeJson(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed || !/^[\[{]/.test(trimmed)) return false;
    try {
        JSON.parse(trimmed);
        return true;
    } catch (_error) {
        return false;
    }
}
