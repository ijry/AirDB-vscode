const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const constants = read("src/common/constants.ts");
assert.match(constants, /KAFKA\s*=\s*"Kafka"/);
assert.match(constants, /KAFKA_CONNECTION\s*=\s*"kafkaConnection"/);
assert.match(constants, /KAFKA_TOPIC_GROUP\s*=\s*"kafkaTopicGroup"/);
assert.match(constants, /KAFKA_TOPIC\s*=\s*"kafkaTopic"/);
assert.match(constants, /KAFKA_PARTITION\s*=\s*"kafkaPartition"/);
assert.match(constants, /KAFKA_CONSUMER_GROUP\s*=\s*"kafkaConsumerGroup"/);
assert.match(constants, /KAFKA_CONSUMER_GROUP_ITEM\s*=\s*"kafkaConsumerGroupItem"/);

const node = read("src/model/interface/node.ts");
assert.match(node, /public brokers\?: string;/);
assert.match(node, /public clientId\?: string;/);
assert.match(node, /public kafkaAuth\?:/);
assert.match(node, /source\.brokers/);
assert.match(node, /DatabaseType\.KAFKA/);
assert.match(node, /ModelType\.KAFKA_CONNECTION/);

const manager = read("src/service/connectionManager.ts");
assert.match(manager, /KafkaConnection/);
assert.match(manager, /case DatabaseType\.KAFKA:/);
assert.match(manager, /return new KafkaConnection\(opt\)/);

const tree = read("src/provider/treeDataProvider.ts");
assert.match(tree, /KafkaConnectionNode/);
assert.match(tree, /DatabaseType\.KAFKA/);
assert.match(tree, /new KafkaConnectionNode\(key, connectInfo\)/);

for (const file of [
  "src/model/kafka/kafkaBase.ts",
  "src/model/kafka/kafkaConnectionNode.ts",
  "src/model/kafka/kafkaTopicGroupNode.ts",
  "src/model/kafka/kafkaTopicNode.ts",
  "src/model/kafka/kafkaPartitionNode.ts",
  "src/model/kafka/kafkaConsumerGroupNode.ts",
  "src/model/kafka/kafkaConsumerGroupItemNode.ts",
]) {
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", file)), `${file} exists`);
}

console.log("kafkaTreeRegistration tests passed");
