import { Node } from "@/model/interface/node";
import { PostgreSqlConnection } from "./postgreSqlConnection";

export class RedshiftConnection extends PostgreSqlConnection {
    constructor(node: Node) {
        super(RedshiftConnection.normalizeNode(node));
    }

    public static normalizeNode(node: Node): Node {
        return {
            ...node,
            port: node.port || 5439,
            database: node.database || "dev",
            user: node.user || "awsuser",
            useSSL: node.useSSL == null ? true : node.useSSL,
        } as Node;
    }
}
