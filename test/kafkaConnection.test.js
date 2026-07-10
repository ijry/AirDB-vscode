const assert = require("assert");
const { requireTs } = require("./testSetup");

const { KafkaConnection } = requireTs("src/service/connect/kafkaConnection.ts");

function createFakeKafkaFactory() {
  const calls = [];

  function factory(config) {
    calls.push(["factory", config]);
    return {
      admin() {
        return {
          connect: async () => calls.push(["admin.connect"]),
          disconnect: async () => calls.push(["admin.disconnect"]),
          listTopics: async () => ["orders"],
          fetchTopicMetadata: async ({ topics }) => ({
            topics: topics.map((name) => ({
              name,
              partitions: [
                { partitionId: 0, leader: 1, replicas: [1, 2], isr: [1, 2] },
              ],
            })),
          }),
          fetchTopicOffsets: async (topic) => [
            { topic, partition: 0, low: "2", high: "8", offset: "8" },
          ],
          listGroups: async () => ({
            groups: [{ groupId: "airdb-consumer", protocolType: "consumer" }],
          }),
          describeGroups: async (groupIds) => ({
            groups: groupIds.map((groupId) => ({
              groupId,
              state: "Stable",
              protocolType: "consumer",
              members: [],
            })),
          }),
          fetchOffsets: async ({ groupId }) => [
            {
              groupId,
              topic: "orders",
              partitions: [{ partition: 0, offset: "7" }],
            },
          ],
        };
      },
      producer() {
        return {
          connect: async () => calls.push(["producer.connect"]),
          disconnect: async () => calls.push(["producer.disconnect"]),
          send: async (payload) => {
            calls.push(["producer.send", payload]);
            return [{ topicName: payload.topic, partition: 0, baseOffset: "9" }];
          },
        };
      },
      consumer() {
        return {
          connect: async () => calls.push(["consumer.connect"]),
          disconnect: async () => calls.push(["consumer.disconnect"]),
          subscribe: async (payload) => calls.push(["consumer.subscribe", payload]),
          seek: (payload) => calls.push(["consumer.seek", payload]),
          run: async ({ eachMessage }) => {
            await eachMessage({
              topic: "orders",
              partition: 0,
              message: {
                offset: "4",
                timestamp: "1710000000000",
                key: Buffer.from("id-1"),
                value: Buffer.from("{\"ok\":true}"),
                headers: { source: Buffer.from("test") },
              },
            });
          },
        };
      },
    };
  }

  return { calls, factory };
}

(async () => {
  const fake = createFakeKafkaFactory();
  const connection = new KafkaConnection(
    { brokers: "localhost:9092", clientId: "airdb-test", dbType: "Kafka" },
    fake.factory
  );

  await new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()));
  });

  assert.strictEqual(connection.isAlive(), true);
  assert.deepStrictEqual(await connection.listTopics(), ["orders"]);

  const metadata = await connection.describeTopics(["orders"]);
  assert.strictEqual(metadata.topics[0].name, "orders");

  const offsets = await connection.fetchTopicOffsets("orders");
  assert.strictEqual(offsets[0].high, "8");

  const groups = await connection.listConsumerGroups();
  assert.strictEqual(groups[0].groupId, "airdb-consumer");

  const groupDetails = await connection.describeConsumerGroups(["airdb-consumer"]);
  assert.strictEqual(groupDetails.groups[0].state, "Stable");

  const groupOffsets = await connection.fetchConsumerGroupOffsets("airdb-consumer");
  assert.strictEqual(groupOffsets[0].partitions[0].offset, "7");

  const messages = await connection.readMessages({
    topic: "orders",
    partition: 0,
    startMode: "offset",
    offset: "4",
    limit: 1,
    timeoutMs: 100,
  });

  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].key, "id-1");
  assert.strictEqual(messages[0].value, "{\"ok\":true}");
  assert.strictEqual(messages[0].headers.source, "test");

  const sendResult = await connection.sendMessage({
    topic: "orders",
    partition: 0,
    key: "id-2",
    value: "hello",
    headers: { source: "manual" },
  });
  assert.strictEqual(sendResult[0].baseOffset, "9");

  connection.end();
  assert.strictEqual(connection.isAlive(), false);
  assert.deepStrictEqual(
    fake.calls.filter((call) => String(call[0]).endsWith(".disconnect")).map((call) => call[0]),
    [
      "admin.disconnect",
      "admin.disconnect",
      "admin.disconnect",
      "admin.disconnect",
      "admin.disconnect",
      "admin.disconnect",
      "admin.disconnect",
      "consumer.disconnect",
      "producer.disconnect",
    ]
  );

  console.log("kafkaConnection tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
