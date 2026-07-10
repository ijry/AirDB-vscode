import { Node } from "@/model/interface/node";
import { KafkaConnection } from "@/service/connect/kafkaConnection";
import { ConnectionManager } from "@/service/connectionManager";

export abstract class KafkaBaseNode extends Node {
    protected async getKafkaConnection(): Promise<KafkaConnection> {
        return await ConnectionManager.getConnection(this) as KafkaConnection;
    }
}
