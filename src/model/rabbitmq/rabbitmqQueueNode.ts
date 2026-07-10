import { ModelType } from "@/common/constants";
import { ViewManager } from "@/common/viewManager";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { RabbitMQBaseNode } from "./rabbitmqBase";

export class RabbitMQQueueNode extends RabbitMQBaseNode {
    public contextValue: string = ModelType.RABBITMQ_QUEUE;
    public iconPath = new vscode.ThemeIcon("inbox");
    public queue: string;

    constructor(public meta: any, readonly parent: Node) {
        super(meta.name);
        this.queue = meta.name;
        this.description = `messages ${meta.messages || 0}`;
        this.init(parent);
        this.command = {
            command: "airdb.rabbitmq.queue.view",
            title: "View RabbitMQ Messages",
            arguments: [this],
        };
    }

    public viewMessages() {
        ViewManager.createWebviewPanel({
            title: `${this.queue} messages`,
            type: `rabbitmq-message-viewer-${this.getConnectId()}-${this.queue}`,
            splitView: true,
            singlePage: false,
            path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", "rabbitmqMessageViewer");
                }).on("route-rabbitmqMessageViewer", () => {
                    handler.emit("config", { queue: this.queue });
                }).on("readRabbitMQMessages", async (options) => {
                    try {
                        const connection = await this.getRabbitMQConnection();
                        const rows = await connection.getMessages(this.queue, options.count || 20, options.requeue !== false);
                        handler.emit("messages", rows);
                    } catch (error) {
                        handler.emit("error", error?.message || String(error));
                    }
                });
            },
        });
    }

    public sendMessage() {
        ViewManager.createWebviewPanel({
            title: `${this.queue} producer`,
            type: `rabbitmq-message-producer-${this.getConnectId()}-${this.queue}`,
            splitView: true,
            singlePage: false,
            path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", "rabbitmqMessageProducer");
                }).on("route-rabbitmqMessageProducer", () => {
                    handler.emit("config", { queue: this.queue });
                }).on("sendRabbitMQMessage", async (payload) => {
                    try {
                        const connection = await this.getRabbitMQConnection();
                        const result = await connection.publishMessage({
                            queue: this.queue,
                            payload: payload.payload || "",
                            persistent: payload.persistent !== false,
                            contentType: payload.contentType || "text/plain",
                        });
                        handler.emit("sent", result);
                    } catch (error) {
                        handler.emit("error", error?.message || String(error));
                    }
                });
            },
        });
    }
}
