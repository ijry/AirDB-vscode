const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const pkg = read("package.json");
assert.match(pkg, /airdb\.kafka\.topic\.view/);
assert.match(pkg, /airdb\.kafka\.topic\.send/);
assert.match(pkg, /viewItem == kafkaTopic/);

const extension = read("src/extension.ts");
assert.match(extension, /KafkaTopicNode/);
assert.match(extension, /"airdb\.kafka\.topic\.view"/);
assert.match(extension, /"airdb\.kafka\.topic\.send"/);
assert.match(extension, /topicNode\.viewMessages\(\)/);
assert.match(extension, /topicNode\.sendMessage\(\)/);

const topicNode = read("src/model/kafka/kafkaTopicNode.ts");
assert.match(topicNode, /ViewManager\.createWebviewPanel/);
assert.match(topicNode, /route["']?, ["']kafkaMessageViewer["']/);
assert.match(topicNode, /route["']?, ["']kafkaMessageProducer["']/);
assert.match(topicNode, /readKafkaMessages/);
assert.match(topicNode, /sendKafkaMessage/);

const main = read("src/vue/main.js");
assert.match(main, /kafkaMessageViewer/);
assert.match(main, /kafkaMessageProducer/);

assert.ok(fs.existsSync(path.resolve(__dirname, "../src/vue/kafka/messageViewer.vue")));
assert.ok(fs.existsSync(path.resolve(__dirname, "../src/vue/kafka/messageProducer.vue")));

console.log("kafkaWebviewRegistration tests passed");
