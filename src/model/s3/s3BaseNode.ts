import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { S3Connection } from "@/service/connect/s3Connection";
import { ConnectionManager } from "@/service/connectionManager";

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
}
