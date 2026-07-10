import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import { ZooKeeperConnection } from "@/service/connect/zookeeperConnection";
import { ConnectionManager } from "@/service/connectionManager";

export abstract class ZooKeeperBaseNode extends Node {
    protected getZooKeeperConnectionNode(): Node {
        let current: Node = this;
        while (current.parent && current.contextValue != ModelType.ZOOKEEPER_CONNECTION) {
            current = current.parent;
        }
        return current;
    }

    protected async getZooKeeperConnection(): Promise<ZooKeeperConnection> {
        return await ConnectionManager.getConnection(this.getZooKeeperConnectionNode()) as ZooKeeperConnection;
    }

    protected infoOnError(operation: string, error: any): Node[] {
        return [new InfoNode(`${operation} failed: ${this.formatError(error)}`)];
    }

    protected formatError(error: any): string {
        return error?.message || String(error);
    }
}
