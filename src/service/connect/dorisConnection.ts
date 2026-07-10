import { Node } from "@/model/interface/node";
import { MysqlConnection } from "./mysqlConnection";

export class DorisConnection extends MysqlConnection {
    constructor(node: Node) {
        super({
            ...node,
            port: node.port || 9030,
        } as Node);
    }
}
