import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import { Neo4jConnection } from "@/service/connect/neo4jConnection";
import { ConnectionManager } from "@/service/connectionManager";

export abstract class Neo4jBaseNode extends Node {
    protected getNeo4jConnectionNode(): Node {
        let current: Node = this;
        while (current.parent && current.contextValue != ModelType.NEO4J_CONNECTION) {
            current = current.parent;
        }
        return current;
    }

    protected async getNeo4jConnection(): Promise<Neo4jConnection> {
        return await ConnectionManager.getConnection(this.getNeo4jConnectionNode()) as Neo4jConnection;
    }

    protected infoOnError(operation: string, error: any): Node[] {
        return [new InfoNode(`${operation} failed: ${this.formatError(error)}`)];
    }

    protected emptyInfo(message: string): Node[] {
        return [new InfoNode(message)];
    }

    private formatError(error: any): string {
        return error?.message || String(error);
    }
}
