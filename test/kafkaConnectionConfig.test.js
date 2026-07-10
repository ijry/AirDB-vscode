const assert = require("assert");
const { requireTs } = require("./testSetup");

const {
  createKafkaConfig,
  normalizeKafkaBrokers,
} = requireTs("src/service/connect/kafkaConnection.ts");

assert.deepStrictEqual(
  normalizeKafkaBrokers({ brokers: "broker1:9092, broker2:9093" }),
  ["broker1:9092", "broker2:9093"]
);

assert.deepStrictEqual(
  normalizeKafkaBrokers({ host: "127.0.0.1", port: 9092 }),
  ["127.0.0.1:9092"]
);

assert.deepStrictEqual(
  normalizeKafkaBrokers({ host: "127.0.0.1:19092" }),
  ["127.0.0.1:19092"]
);

const plain = createKafkaConfig({
  brokers: "kafka-a:9092,kafka-b:9092",
  clientId: "airdb-ui",
  kafkaAuth: "plain",
  user: "alice",
  password: "secret",
  useSSL: true,
});

assert.strictEqual(plain.clientId, "airdb-ui");
assert.deepStrictEqual(plain.brokers, ["kafka-a:9092", "kafka-b:9092"]);
assert.strictEqual(plain.ssl, true);
assert.strictEqual(plain.sasl.mechanism, "plain");
assert.strictEqual(plain.sasl.username, "alice");
assert.strictEqual(plain.sasl.password, "secret");

const scram = createKafkaConfig({
  host: "kafka-c",
  port: 9094,
  kafkaAuth: "scram-sha-512",
  user: "bob",
  password: "pw",
});

assert.deepStrictEqual(scram.brokers, ["kafka-c:9094"]);
assert.strictEqual(scram.clientId, "airdb");
assert.strictEqual(scram.sasl.mechanism, "scram-sha-512");
assert.strictEqual(scram.ssl, undefined);

console.log("kafkaConnectionConfig tests passed");
