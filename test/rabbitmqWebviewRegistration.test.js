const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const pkg = read("package.json");
assert.match(pkg, /airdb\.rabbitmq\.queue\.view/);
assert.match(pkg, /airdb\.rabbitmq\.queue\.send/);
assert.match(pkg, /viewItem == rabbitmqQueue/);

const extension = read("src/extension.ts");
assert.match(extension, /RabbitMQQueueNode/);
assert.match(extension, /"airdb\.rabbitmq\.queue\.view"/);
assert.match(extension, /"airdb\.rabbitmq\.queue\.send"/);
assert.match(extension, /queueNode\.viewMessages\(\)/);
assert.match(extension, /queueNode\.sendMessage\(\)/);

const queueNode = read("src/model/rabbitmq/rabbitmqQueueNode.ts");
assert.match(queueNode, /ViewManager\.createWebviewPanel/);
assert.match(queueNode, /route["']?, ["']rabbitmqMessageViewer["']/);
assert.match(queueNode, /route["']?, ["']rabbitmqMessageProducer["']/);
assert.match(queueNode, /readRabbitMQMessages/);
assert.match(queueNode, /sendRabbitMQMessage/);
assert.match(queueNode, /publishMessage/);

const main = read("src/vue/main.js");
assert.match(main, /rabbitmqMessageViewer/);
assert.match(main, /rabbitmqMessageProducer/);

assert.ok(fs.existsSync(path.resolve(__dirname, "../src/vue/rabbitmq/messageViewer.vue")));
assert.ok(fs.existsSync(path.resolve(__dirname, "../src/vue/rabbitmq/messageProducer.vue")));

console.log("rabbitmqWebviewRegistration tests passed");
