import { ConfigKey, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { CommandKey, Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import { S3BucketNode } from "@/model/s3/s3BucketNode";
import { formatS3Error } from "@/service/connect/s3Connection";
import * as vscode from "vscode";
import { S3BaseNode } from "./s3BaseNode";

export class S3ConnectionNode extends S3BaseNode {
    public contextValue: string = ModelType.S3_CONNECTION;
    public iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("cloud");

    constructor(readonly key: string, readonly parent: Node) {
        super(key);
        this.init(parent);
        this.label = this.endpoint || this.host || "S3";
        if (parent.name) {
            this.name = parent.name;
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true);
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        this.cacheSelf();
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description = (this.description || "") + " closed";
        }
    }

    async getChildren(): Promise<Node[]> {
        try {
            if (this.bucket) {
                return [new S3BucketNode(this.bucket, this)];
            }
            const connection = await this.getS3Connection();
            const buckets = await connection.listBuckets();
            if (!buckets.length) return [new InfoNode(vscode.l10n.t("There are no files in this folder."))];
            return buckets
                .map((bucket) => new S3BucketNode(bucket.name, this, bucket.creationDate))
                .sort((a, b) => String(a.label).localeCompare(String(b.label)));
        } catch (error) {
            return [new InfoNode(`List buckets failed: ${formatS3Error(error)}`)];
        }
    }

    public copyName() {
        Util.copyToBoard(String(this.endpoint || this.host || this.label));
    }

    public async deleteConnection() {
        Util.confirm(vscode.l10n.t(`Are you sure you want to Delete Connection {0} ? `, this.label), async () => {
            this.indent({ command: CommandKey.delete });
        });
    }
}
