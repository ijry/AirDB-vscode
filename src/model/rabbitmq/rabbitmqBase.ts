import { Node } from "@/model/interface/node";
import { RabbitMQConnection } from "@/service/connect/rabbitmqConnection";
import { ConnectionManager } from "@/service/connectionManager";

export abstract class RabbitMQBaseNode extends Node {
    protected async getRabbitMQConnection(): Promise<RabbitMQConnection> {
        return await ConnectionManager.getConnection(this) as RabbitMQConnection;
    }
}
