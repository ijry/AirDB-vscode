# Kafka Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Apache Kafka support to AirDB as a NoSQL connection type with connection testing, topic/partition/group browsing, message viewing, and message sending.

**Architecture:** Kafka is registered beside Redis, MongoDB, and ElasticSearch under `CacheKey.NOSQL_CONNECTION` and `activitybar.airdb.nosql`. A dedicated `KafkaConnection` wraps KafkaJS admin, consumer, and producer clients; tree nodes call Kafka methods directly; Vue webviews provide one-shot read and send workflows.

**Tech Stack:** VS Code extension TypeScript, Vue 2, Element UI, webpack 4, Node.js, `kafkajs@2.2.4`, existing Node/Vue source-scan tests.

## Global Constraints

- Use `kafkajs@2.2.4`.
- KafkaJS must be bundled as a normal npm dependency.
- Do not add `node-rdkafka`, native Kafka bindings, or external Kafka CLI requirements.
- Kafka is a NoSQL connection using `CacheKey.NOSQL_CONNECTION` and `activitybar.airdb.nosql`.
- Add `DatabaseType.KAFKA = "Kafka"`.
- Add `ModelType.KAFKA_CONNECTION`, `KAFKA_TOPIC_GROUP`, `KAFKA_TOPIC`, `KAFKA_PARTITION`, `KAFKA_CONSUMER_GROUP`, and `KAFKA_CONSUMER_GROUP_ITEM`.
- First version excludes long-running live subscription panels, topic create/delete, partition reassignment, Schema Registry, Avro/Protobuf decoding, Kafka Connect, transactions, ACL management, and cluster configuration editing.
- Kafka auth modes are `none`, `plain`, `scram-sha-256`, and `scram-sha-512`.
- Default Kafka connection values are `host: "127.0.0.1:9092"`, `brokers: "127.0.0.1:9092"`, `clientId: "airdb"`, `kafkaAuth: "none"`, `port: null`, and `useSSL: false`.

---

## File Structure

- Create `src/service/connect/kafkaConnection.ts`: KafkaJS config helpers and the `KafkaConnection` class.
- Modify `package.json`: add `kafkajs` dependency and Kafka commands/menu entries.
- Create `test/kafkaConnectionConfig.test.js`: config mapping tests for brokers, SSL, SASL.
- Create `test/kafkaConnection.test.js`: fake KafkaJS driver tests for connect, admin calls, read, send, cleanup.
- Modify `src/common/constants.ts`: Kafka enum values.
- Modify `src/model/interface/node.ts`: persisted Kafka fields and connection-node cache/uid behavior.
- Modify `src/service/connectionManager.ts`: instantiate `KafkaConnection`.
- Modify `src/provider/treeDataProvider.ts`: route Kafka to NoSQL and instantiate `KafkaConnectionNode`.
- Create `src/model/kafka/kafkaBase.ts`: shared helper for Kafka tree nodes.
- Create `src/model/kafka/kafkaConnectionNode.ts`: root Kafka connection node.
- Create `src/model/kafka/kafkaTopicGroupNode.ts`: topics container node.
- Create `src/model/kafka/kafkaTopicNode.ts`: topic node with partition children and webview commands.
- Create `src/model/kafka/kafkaPartitionNode.ts`: partition metadata node.
- Create `src/model/kafka/kafkaConsumerGroupNode.ts`: consumer groups container node.
- Create `src/model/kafka/kafkaConsumerGroupItemNode.ts`: consumer group detail node.
- Create `test/kafkaTreeRegistration.test.js`: source-level registration tests.
- Modify `src/vue/connect/index.vue`: Kafka logo, database list, defaults, SSL visibility, component registration.
- Create `src/vue/connect/component/Kafka.vue`: brokers/client/auth UI.
- Create `test/kafkaUiConfig.test.js`: source-level connection UI tests.
- Modify `src/extension.ts`: Kafka commands call topic node methods.
- Modify `src/vue/main.js`: Kafka webview routes.
- Create `src/vue/kafka/messageViewer.vue`: one-shot message read UI.
- Create `src/vue/kafka/messageProducer.vue`: one-shot message send UI.
- Create `test/kafkaWebviewRegistration.test.js`: source-level command and route tests.

---

### Task 1: Kafka Dependency And Connection Service

**Files:**
- Create: `src/service/connect/kafkaConnection.ts`
- Modify: `package.json`
- Test: `test/kafkaConnectionConfig.test.js`
- Test: `test/kafkaConnection.test.js`

**Interfaces:**
- Produces: `normalizeKafkaBrokers(node: { brokers?: string; host?: string; port?: number | string }): string[]`
- Produces: `createKafkaConfig(node: Node): KafkaConfig`
- Produces: `class KafkaConnection extends IConnection`
- Produces: `KafkaConnection.listTopics(): Promise<string[]>`
- Produces: `KafkaConnection.describeTopics(topics?: string[]): Promise<any>`
- Produces: `KafkaConnection.fetchTopicOffsets(topic: string): Promise<any[]>`
- Produces: `KafkaConnection.listConsumerGroups(): Promise<any[]>`
- Produces: `KafkaConnection.describeConsumerGroups(groupIds: string[]): Promise<any>`
- Produces: `KafkaConnection.fetchConsumerGroupOffsets(groupId: string, topics?: string[]): Promise<any>`
- Produces: `KafkaConnection.readMessages(options: KafkaReadOptions): Promise<KafkaMessageRow[]>`
- Produces: `KafkaConnection.sendMessage(options: KafkaSendOptions): Promise<any>`

- [ ] **Step 1: Add failing config test**

Create `test/kafkaConnectionConfig.test.js`:

```js
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
```

- [ ] **Step 2: Add failing fake-driver connection test**

Create `test/kafkaConnection.test.js`:

```js
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
      "consumer.disconnect",
      "producer.disconnect",
    ]
  );

  console.log("kafkaConnection tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node test/kafkaConnectionConfig.test.js
node test/kafkaConnection.test.js
```

Expected: both fail because `src/service/connect/kafkaConnection.ts` does not exist.

- [ ] **Step 4: Add KafkaJS dependency**

Run:

```bash
npm install kafkajs@2.2.4 --save
```

Expected: `package.json` gains `"kafkajs": "^2.2.4"` or `"kafkajs": "2.2.4"` under `dependencies`, and the package is installed under `node_modules`.

- [ ] **Step 5: Create connection service**

Create `src/service/connect/kafkaConnection.ts` with these exported names and behavior:

```ts
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";
import * as fs from "fs";
import { Kafka, KafkaConfig, logLevel } from "kafkajs";

export type KafkaAuthMode = "none" | "plain" | "scram-sha-256" | "scram-sha-512";
export type KafkaReadStartMode = "beginning" | "latest" | "offset";

export interface KafkaReadOptions {
  topic: string;
  partition?: number;
  startMode: KafkaReadStartMode;
  offset?: string | number;
  limit?: number;
  timeoutMs?: number;
}

export interface KafkaMessageRow {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key: string;
  value: string;
  headers: { [key: string]: string };
}

export interface KafkaSendOptions {
  topic: string;
  partition?: number;
  key?: string;
  value: string;
  headers?: { [key: string]: string };
}

type KafkaFactory = (config: KafkaConfig) => any;

function bufferToText(value: Buffer | string | null | undefined): string {
  if (value == null) return "";
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

function normalizeHeaders(headers: any): { [key: string]: string } {
  const result = {};
  for (const key of Object.keys(headers || {})) {
    result[key] = bufferToText(headers[key]);
  }
  return result;
}

export function normalizeKafkaBrokers(node: { brokers?: string; host?: string; port?: number | string }): string[] {
  const source = node.brokers || node.host || "127.0.0.1:9092";
  return String(source)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.includes(":")) return item;
      return `${item}:${node.port || 9092}`;
    });
}

export function createKafkaConfig(node: Node | any): KafkaConfig {
  const config: KafkaConfig = {
    clientId: node.clientId || "airdb",
    brokers: normalizeKafkaBrokers(node),
    logLevel: logLevel.ERROR,
    connectionTimeout: parseInt(node.connectTimeout || 5000),
    requestTimeout: parseInt(node.requestTimeout || 30000),
  };

  if (node.useSSL) {
    if (node.caPath || node.clientCertPath || node.clientKeyPath) {
      config.ssl = {
        rejectUnauthorized: false,
        ca: node.caPath ? [fs.readFileSync(node.caPath, "utf8")] : undefined,
        cert: node.clientCertPath ? fs.readFileSync(node.clientCertPath, "utf8") : undefined,
        key: node.clientKeyPath ? fs.readFileSync(node.clientKeyPath, "utf8") : undefined,
      };
    } else {
      config.ssl = true;
    }
  }

  if (node.kafkaAuth && node.kafkaAuth !== "none") {
    config.sasl = {
      mechanism: node.kafkaAuth,
      username: node.user || "",
      password: node.password || "",
    } as any;
  }

  return config;
}

export class KafkaConnection extends IConnection {
  private connected = false;
  private kafka: any;

  constructor(private node: Node, private kafkaFactory: KafkaFactory = (config) => new Kafka(config)) {
    super();
    this.kafka = kafkaFactory(createKafkaConfig(node));
  }

  query(_sql: string, callback?: queryCallback): void;
  query(_sql: string, _values: any, callback?: queryCallback): void;
  query(_sql: any, values?: any, callback?: any) {
    const cb = callback || (values instanceof Function ? values : null);
    if (cb) cb(new Error("Kafka connection does not support SQL query."));
  }

  async getAdmin(): Promise<any> {
    const admin = this.kafka.admin();
    await admin.connect();
    return admin;
  }

  async withAdmin<T>(runner: (admin: any) => Promise<T>): Promise<T> {
    const admin = await this.getAdmin();
    try {
      return await runner(admin);
    } finally {
      await admin.disconnect();
    }
  }

  async listTopics(): Promise<string[]> {
    return this.withAdmin((admin) => admin.listTopics());
  }

  async describeTopics(topics?: string[]): Promise<any> {
    return this.withAdmin((admin) => admin.fetchTopicMetadata(topics ? { topics } : undefined));
  }

  async fetchTopicOffsets(topic: string): Promise<any[]> {
    return this.withAdmin((admin) => admin.fetchTopicOffsets(topic));
  }

  async listConsumerGroups(): Promise<any[]> {
    return this.withAdmin(async (admin) => {
      const result = await admin.listGroups();
      return result.groups || [];
    });
  }

  async describeConsumerGroups(groupIds: string[]): Promise<any> {
    return this.withAdmin((admin) => admin.describeGroups(groupIds));
  }

  async fetchConsumerGroupOffsets(groupId: string, topics?: string[]): Promise<any> {
    return this.withAdmin((admin) => admin.fetchOffsets({ groupId, topics }));
  }

  async readMessages(options: KafkaReadOptions): Promise<KafkaMessageRow[]> {
    const limit = Math.max(1, parseInt(String(options.limit || 100)));
    const timeoutMs = Math.max(500, parseInt(String(options.timeoutMs || 8000)));
    const groupId = `airdb-preview-${Date.now()}-${Math.round(Math.random() * 100000)}`;
    const consumer = this.kafka.consumer({ groupId });
    const messages: KafkaMessageRow[] = [];
    let completed = false;
    let timer: NodeJS.Timeout;

    const finish = async (resolve: (rows: KafkaMessageRow[]) => void) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      try {
        await consumer.disconnect();
      } finally {
        resolve(messages);
      }
    };

    return new Promise<KafkaMessageRow[]>(async (resolve, reject) => {
      try {
        await consumer.connect();
        await consumer.subscribe({
          topic: options.topic,
          fromBeginning: options.startMode === "beginning" || options.startMode === "offset",
        });
        if (options.startMode === "offset" && options.offset != null) {
          consumer.seek({
            topic: options.topic,
            partition: options.partition || 0,
            offset: String(options.offset),
          });
        }
        timer = setTimeout(() => finish(resolve), timeoutMs);
        await consumer.run({
          eachMessage: async ({ topic, partition, message }) => {
            if (options.partition != null && partition !== options.partition) return;
            messages.push({
              topic,
              partition,
              offset: message.offset,
              timestamp: message.timestamp,
              key: bufferToText(message.key),
              value: bufferToText(message.value),
              headers: normalizeHeaders(message.headers),
            });
            if (messages.length >= limit) await finish(resolve);
          },
        });
      } catch (error) {
        clearTimeout(timer);
        try {
          await consumer.disconnect();
        } catch (_disconnectError) {
        }
        reject(error);
      }
    });
  }

  async sendMessage(options: KafkaSendOptions): Promise<any> {
    const producer = this.kafka.producer();
    await producer.connect();
    try {
      const message: any = {
        key: options.key,
        value: options.value,
        headers: options.headers || {},
      };
      if (options.partition != null) message.partition = options.partition;
      return await producer.send({
        topic: options.topic,
        messages: [message],
      });
    } finally {
      await producer.disconnect();
    }
  }

  connect(callback: (err: Error) => void): void {
    this.withAdmin(async (admin) => {
      await admin.listTopics();
      this.connected = true;
    }).then(() => callback(null)).catch((error) => callback(error));
  }

  beginTransaction(callback: (err: Error) => void): void {
    callback(new Error("Kafka connection does not support transactions."));
  }

  rollback(): void {
  }

  commit(): void {
  }

  end(): void {
    this.connected = false;
  }

  isAlive(): boolean {
    return this.connected;
  }
}
```

- [ ] **Step 6: Run service tests**

Run:

```bash
node test/kafkaConnectionConfig.test.js
node test/kafkaConnection.test.js
```

Expected:

```text
kafkaConnectionConfig tests passed
kafkaConnection tests passed
```

- [ ] **Step 7: Commit service task**

Run:

```bash
git add package.json package-lock.json src/service/connect/kafkaConnection.ts test/kafkaConnectionConfig.test.js test/kafkaConnection.test.js
git commit -m "feat: add kafka connection service"
```

If `package-lock.json` is not present after `npm install`, omit it from `git add`.

---

### Task 2: Kafka Tree Model And Registration

**Files:**
- Modify: `src/common/constants.ts`
- Modify: `src/model/interface/node.ts`
- Modify: `src/service/connectionManager.ts`
- Modify: `src/provider/treeDataProvider.ts`
- Create: `src/model/kafka/kafkaBase.ts`
- Create: `src/model/kafka/kafkaConnectionNode.ts`
- Create: `src/model/kafka/kafkaTopicGroupNode.ts`
- Create: `src/model/kafka/kafkaTopicNode.ts`
- Create: `src/model/kafka/kafkaPartitionNode.ts`
- Create: `src/model/kafka/kafkaConsumerGroupNode.ts`
- Create: `src/model/kafka/kafkaConsumerGroupItemNode.ts`
- Test: `test/kafkaTreeRegistration.test.js`

**Interfaces:**
- Consumes: `KafkaConnection` methods from Task 1.
- Produces: `KafkaConnectionNode` for `DbTreeDataProvider.getNode()`.
- Produces: Kafka tree context values used by `package.json` menu `when` clauses.
- Produces: `KafkaTopicNode.viewMessages()` and `KafkaTopicNode.sendMessage()` stubs that Task 4 fills with webview panels.

- [ ] **Step 1: Add failing source registration test**

Create `test/kafkaTreeRegistration.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node test/kafkaTreeRegistration.test.js
```

Expected: FAIL because Kafka constants and files are missing.

- [ ] **Step 3: Register constants and persisted node fields**

Modify `src/common/constants.ts`:

```ts
export enum DatabaseType {
    MYSQL = "MySQL", PG = "PostgreSQL", KINGBASE = "KingbaseES", DAMENG = "Dameng", SQLITE = "SQLite",
    MSSQL = "SqlServer", ORACLE = "Oracle", MONGO_DB="MongoDB",
    ES = "ElasticSearch", REDIS = "Redis", KAFKA = "Kafka", SSH="SSH", FTP="FTP"
}
```

Add Kafka values to `ModelType` after the ElasticSearch group:

```ts
    /**
     * Kafka
     */
    KAFKA_CONNECTION = "kafkaConnection", KAFKA_TOPIC_GROUP = "kafkaTopicGroup", KAFKA_TOPIC = "kafkaTopic",
    KAFKA_PARTITION = "kafkaPartition", KAFKA_CONSUMER_GROUP = "kafkaConsumerGroup",
    KAFKA_CONSUMER_GROUP_ITEM = "kafkaConsumerGroupItem",
```

Modify `src/model/interface/node.ts` by adding these fields after the ElasticSearch fields:

```ts
    /**
     * kafka only
     */
    public brokers?: string;
    public clientId?: string;
    public kafkaAuth?: "none" | "plain" | "scram-sha-256" | "scram-sha-512";
```

Copy them in `init(source: Node)` after ElasticSearch fields:

```ts
        this.brokers = source.brokers
        this.clientId = source.clientId
        this.kafkaAuth = source.kafkaAuth
```

Change dialect initialization:

```ts
        if (!this.dialect && this.dbType != DatabaseType.REDIS && this.dbType != DatabaseType.KAFKA) {
            this.dialect = ServiceManager.getDialect(this.dbType)
        }
```

Change `cacheSelf()` root connection branch:

```ts
        if (this.contextValue == ModelType.CONNECTION || this.contextValue == ModelType.ES_CONNECTION || this.contextValue == ModelType.KAFKA_CONNECTION) {
            Node.nodeCache[`${this.getConnectId()}`] = this;
```

Change `initUid()` root connection branch:

```ts
        if (this.contextValue == ModelType.CONNECTION || this.contextValue == ModelType.CATALOG || this.contextValue == ModelType.KAFKA_CONNECTION) {
            this.uid = this.getConnectId();
```

- [ ] **Step 4: Register connection manager and tree provider**

Modify `src/service/connectionManager.ts` imports:

```ts
import { KafkaConnection } from "./connect/kafkaConnection";
```

Add the switch case before `DatabaseType.FTP`:

```ts
            case DatabaseType.KAFKA:
                return new KafkaConnection(opt);
```

Modify `src/provider/treeDataProvider.ts` imports:

```ts
import { KafkaConnectionNode } from "@/model/kafka/kafkaConnectionNode";
```

Change `getKeyByNode()`:

```ts
        if (dbType == DatabaseType.ES || dbType == DatabaseType.REDIS || dbType == DatabaseType.KAFKA || dbType == DatabaseType.SSH || dbType == DatabaseType.FTP || dbType == DatabaseType.MONGO_DB) {
            return CacheKey.NOSQL_CONNECTION;
        }
```

Change `getNode()`:

```ts
        } else if (connectInfo.dbType == DatabaseType.KAFKA) {
            node = new KafkaConnectionNode(key, connectInfo)
        } else if (connectInfo.dbType == DatabaseType.SSH) {
```

- [ ] **Step 5: Create Kafka tree node files**

Create `src/model/kafka/kafkaBase.ts`:

```ts
import { Node } from "@/model/interface/node";
import { KafkaConnection } from "@/service/connect/kafkaConnection";
import { ConnectionManager } from "@/service/connectionManager";

export abstract class KafkaBaseNode extends Node {
    protected async getKafkaConnection(): Promise<KafkaConnection> {
        return await ConnectionManager.getConnection(this) as KafkaConnection;
    }
}
```

Create `src/model/kafka/kafkaConnectionNode.ts`:

```ts
import { ConfigKey, Constants, ModelType } from "@/common/constants";
import { Global } from "@/common/global";
import { Util } from "@/common/util";
import { QueryGroup } from "@/model/query/queryGroup";
import { CommandKey, Node } from "@/model/interface/node";
import * as path from "path";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";
import { KafkaConsumerGroupNode } from "./kafkaConsumerGroupNode";
import { KafkaTopicGroupNode } from "./kafkaTopicGroupNode";

export class KafkaConnectionNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_CONNECTION;
    public iconPath: string | vscode.ThemeIcon = new vscode.ThemeIcon("server-environment");

    constructor(readonly key: string, readonly parent: Node) {
        super(key);
        this.init(parent);
        this.label = this.host || this.brokers || "Kafka";
        if (parent.name) {
            this.name = parent.name;
            const preferName = Global.getConfig(ConfigKey.PREFER_CONNECTION_NAME, true);
            preferName ? this.label = parent.name : this.description = parent.name;
        }
        this.cacheSelf();
        if (this.disable) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
            this.description = (this.description || "") + " closed";
            return;
        }
    }

    async getChildren(): Promise<Node[]> {
        return [
            new KafkaTopicGroupNode(this),
            new KafkaConsumerGroupNode(this),
            new QueryGroup(this),
        ];
    }

    public copyName() {
        Util.copyToBoard(this.brokers || this.host);
    }

    public async deleteConnection() {
        Util.confirm(vscode.l10n.t(`Are you sure you want to Delete Connection {0} ? `, this.label), async () => {
            this.indent({ command: CommandKey.delete });
        });
    }
}
```

Create `src/model/kafka/kafkaTopicGroupNode.ts`:

```ts
import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";
import { KafkaTopicNode } from "./kafkaTopicNode";

export class KafkaTopicGroupNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_TOPIC_GROUP;
    public iconPath = new vscode.ThemeIcon("symbol-array");

    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Topics"));
        this.init(parent);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getKafkaConnection();
            const topics = await connection.listTopics();
            if (!topics.length) return [new InfoNode(vscode.l10n.t("This server has no topic!"))];
            return topics.sort().map((topic) => new KafkaTopicNode(topic, this));
        } catch (error) {
            return [new InfoNode(error)];
        }
    }
}
```

Create `src/model/kafka/kafkaTopicNode.ts`:

```ts
import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";
import { KafkaPartitionNode } from "./kafkaPartitionNode";

export class KafkaTopicNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_TOPIC;
    public iconPath = new vscode.ThemeIcon("symbol-event");
    public topic: string;

    constructor(topic: string, readonly parent: Node) {
        super(topic);
        this.topic = topic;
        this.init(parent);
        this.command = {
            command: "airdb.kafka.topic.view",
            title: "View Kafka Messages",
            arguments: [this],
        };
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getKafkaConnection();
            const [metadata, offsets] = await Promise.all([
                connection.describeTopics([this.topic]),
                connection.fetchTopicOffsets(this.topic),
            ]);
            const topicMeta = metadata.topics && metadata.topics[0];
            if (!topicMeta || !topicMeta.partitions || topicMeta.partitions.length === 0) {
                return [new InfoNode(vscode.l10n.t("This topic has no partition metadata."))];
            }
            return topicMeta.partitions.map((partition) => new KafkaPartitionNode(this.topic, partition, offsets, this));
        } catch (error) {
            return [new InfoNode(error)];
        }
    }

    public viewMessages() {
        vscode.window.showInformationMessage(`Kafka message viewer: ${this.topic}`);
    }

    public sendMessage() {
        vscode.window.showInformationMessage(`Kafka message producer: ${this.topic}`);
    }
}
```

Create `src/model/kafka/kafkaPartitionNode.ts`:

```ts
import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";

export class KafkaPartitionNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_PARTITION;
    public iconPath = new vscode.ThemeIcon("list-tree");

    constructor(readonly topic: string, readonly partition: any, readonly offsets: any[], readonly parent: Node) {
        super(`partition ${partition.partitionId}`);
        this.init(parent);
        const offset = offsets.find((item) => String(item.partition) === String(partition.partitionId));
        const low = offset ? offset.low : "";
        const high = offset ? (offset.high || offset.offset) : "";
        this.description = `leader ${partition.leader} offset ${low}-${high}`;
        this.tooltip = `replicas: ${(partition.replicas || []).join(", ")} | isr: ${(partition.isr || []).join(", ")}`;
    }
}
```

Create `src/model/kafka/kafkaConsumerGroupNode.ts`:

```ts
import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";
import { KafkaConsumerGroupItemNode } from "./kafkaConsumerGroupItemNode";

export class KafkaConsumerGroupNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_CONSUMER_GROUP;
    public iconPath = new vscode.ThemeIcon("organization");

    constructor(readonly parent: Node) {
        super(vscode.l10n.t("Consumer Groups"));
        this.init(parent);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getKafkaConnection();
            const groups = await connection.listConsumerGroups();
            if (!groups.length) return [new InfoNode(vscode.l10n.t("This server has no consumer group!"))];
            return groups.map((group) => new KafkaConsumerGroupItemNode(group, this));
        } catch (error) {
            return [new InfoNode(error)];
        }
    }
}
```

Create `src/model/kafka/kafkaConsumerGroupItemNode.ts`:

```ts
import { ModelType } from "@/common/constants";
import { Node } from "@/model/interface/node";
import { InfoNode } from "@/model/other/infoNode";
import * as vscode from "vscode";
import { KafkaBaseNode } from "./kafkaBase";

export class KafkaConsumerGroupItemNode extends KafkaBaseNode {
    public contextValue: string = ModelType.KAFKA_CONSUMER_GROUP_ITEM;
    public iconPath = new vscode.ThemeIcon("account");
    private groupId: string;

    constructor(readonly group: any, readonly parent: Node) {
        super(group.groupId);
        this.groupId = group.groupId;
        this.init(parent);
        this.description = group.protocolType || "";
    }

    async getChildren(): Promise<Node[]> {
        try {
            const connection = await this.getKafkaConnection();
            const [details, offsets] = await Promise.all([
                connection.describeConsumerGroups([this.groupId]),
                connection.fetchConsumerGroupOffsets(this.groupId),
            ]);
            const group = details.groups && details.groups[0];
            const rows: Node[] = [];
            if (group) {
                rows.push(new InfoNode(`state: ${group.state || ""}`));
                rows.push(new InfoNode(`protocol: ${group.protocolType || ""}`));
                rows.push(new InfoNode(`members: ${(group.members || []).length}`));
            }
            for (const topicOffset of offsets || []) {
                for (const partition of topicOffset.partitions || []) {
                    rows.push(new InfoNode(`${topicOffset.topic} partition ${partition.partition}: offset ${partition.offset}`));
                }
            }
            return rows.length ? rows : [new InfoNode(vscode.l10n.t("This consumer group has no offset metadata."))];
        } catch (error) {
            return [new InfoNode(error)];
        }
    }
}
```

- [ ] **Step 6: Run tree registration test**

Run:

```bash
node test/kafkaTreeRegistration.test.js
```

Expected:

```text
kafkaTreeRegistration tests passed
```

- [ ] **Step 7: Commit tree task**

Run:

```bash
git add src/common/constants.ts src/model/interface/node.ts src/service/connectionManager.ts src/provider/treeDataProvider.ts src/model/kafka test/kafkaTreeRegistration.test.js
git commit -m "feat: register kafka tree nodes"
```

---

### Task 3: Kafka Connection UI

**Files:**
- Modify: `src/vue/connect/index.vue`
- Create: `src/vue/connect/component/Kafka.vue`
- Test: `test/kafkaUiConfig.test.js`

**Interfaces:**
- Consumes: Kafka fields from Task 2: `brokers`, `clientId`, `kafkaAuth`, `user`, `password`, `useSSL`.
- Produces: Saved connection objects with `dbType: "Kafka"`, normalized `host`/`brokers`, and auth fields for `KafkaConnection`.

- [ ] **Step 1: Add failing UI source test**

Create `test/kafkaUiConfig.test.js`:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const connect = fs.readFileSync(path.resolve(__dirname, "../src/vue/connect/index.vue"), "utf8");
const kafka = fs.readFileSync(path.resolve(__dirname, "../src/vue/connect/component/Kafka.vue"), "utf8");

assert.match(connect, /import Kafka from "\.\/component\/Kafka\.vue"/);
assert.match(connect, /components: \{[\s\S]*Kafka/);
assert.match(connect, /Kafka:\s*\{\s*text:\s*"KA"/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"Kafka"/);
assert.match(connect, /<Kafka\s+v-else-if="connectionOption\.dbType == 'Kafka'"/);
assert.match(connect, /\['MySQL', 'PostgreSQL', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch', 'Kafka'\]/);
assert.match(connect, /case "Kafka":[\s\S]*this\.connectionOption\.host = "127\.0\.0\.1:9092";[\s\S]*this\.connectionOption\.brokers = "127\.0\.0\.1:9092";[\s\S]*this\.connectionOption\.clientId = "airdb";[\s\S]*this\.connectionOption\.kafkaAuth = "none";[\s\S]*this\.connectionOption\.port = null;/);

assert.match(kafka, /Brokers/);
assert.match(kafka, /Client ID/);
assert.match(kafka, /kafkaAuth/);
assert.match(kafka, /scram-sha-256/);
assert.match(kafka, /scram-sha-512/);
assert.match(kafka, /connectionOption\.host = value/);
assert.match(kafka, /connectionOption\.brokers = value/);

console.log("kafkaUiConfig tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node test/kafkaUiConfig.test.js
```

Expected: FAIL because `Kafka.vue` does not exist and `index.vue` has no Kafka support.

- [ ] **Step 3: Create Kafka connection form component**

Create `src/vue/connect/component/Kafka.vue`:

```vue
<template>
  <div class="mt-5">
    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="inline-block w-32 mr-5 font-bold">
          <span>Brokers</span>
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input
          class="field__input"
          style="width: 34rem"
          placeholder="127.0.0.1:9092,127.0.0.1:9093"
          required
          v-model="brokers"
        />
      </div>
    </section>
    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Client ID</label>
        <input class="w-64 field__input" placeholder="airdb" v-model="connectionOption.clientId" />
      </div>
    </section>
    <section class="mb-2">
      <label class="inline-block mr-5 font-bold w-36">Authentication</label>
      <div class="inline-flex items-center">
        <el-radio v-model="connectionOption.kafkaAuth" label="none">None</el-radio>
        <el-radio v-model="connectionOption.kafkaAuth" label="plain">SASL Plain</el-radio>
        <el-radio v-model="connectionOption.kafkaAuth" label="scram-sha-256">SCRAM-SHA-256</el-radio>
        <el-radio v-model="connectionOption.kafkaAuth" label="scram-sha-512">SCRAM-SHA-512</el-radio>
      </div>
    </section>
    <section v-if="connectionOption.kafkaAuth && connectionOption.kafkaAuth != 'none'">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Username</label>
        <input class="w-64 field__input" placeholder="Username" required v-model="connectionOption.user" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Password</label>
        <el-input size="small" class="w-64 border-0" placeholder="Password" type="password" v-model="connectionOption.password" show-password />
      </div>
    </section>
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">{{ $t('Connection Timeout') }}</label>
        <input class="w-64 field__input" placeholder="5000" v-model="connectionOption.connectTimeout" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">{{ $t('Request Timeout') }}</label>
        <input class="w-64 field__input" placeholder="30000" type="number" v-model="connectionOption.requestTimeout" />
      </div>
    </section>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
  computed: {
    brokers: {
      get() {
        return this.connectionOption.brokers || this.connectionOption.host;
      },
      set(value) {
        this.connectionOption.host = value;
        this.connectionOption.brokers = value;
      },
    },
  },
  mounted() {
    if (!this.connectionOption.clientId) this.connectionOption.clientId = "airdb";
    if (!this.connectionOption.kafkaAuth) this.connectionOption.kafkaAuth = "none";
    if (!this.connectionOption.brokers) this.connectionOption.brokers = this.connectionOption.host || "127.0.0.1:9092";
    this.connectionOption.host = this.connectionOption.brokers;
  },
};
</script>
```

- [ ] **Step 4: Register Kafka in `src/vue/connect/index.vue`**

Add the component in the template after `ElasticSearch`:

```vue
    <ElasticSearch v-if="connectionOption.dbType == 'ElasticSearch'" :connectionOption="connectionOption" />
    <Kafka v-else-if="connectionOption.dbType == 'Kafka'" :connectionOption="connectionOption" />
```

Add the import:

```js
import Kafka from "./component/Kafka.vue";
```

Add the logo:

```js
  Kafka: {
    text: "KA",
    bg: "#f8fafc",
    color: "#111827",
  },
```

Register the component:

```js
  components: { ElasticSearch, Kafka, SQLite, SQLServer, SSH, SSL, FTP, LingyunUser },
```

Add the support database value after `"ElasticSearch"`:

```js
        "Kafka",
```

Add Kafka to the SSL toggle array:

```vue
          connectionOption.dbType == 'Kafka'
```

Add Kafka to the `SSL` component array:

```vue
        ['MySQL', 'PostgreSQL', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch', 'Kafka'].includes(connectionOption.dbType)
```

Add the watcher case:

```js
        case "Kafka":
          this.connectionOption.host = "127.0.0.1:9092";
          this.connectionOption.brokers = "127.0.0.1:9092";
          this.connectionOption.clientId = "airdb";
          this.connectionOption.kafkaAuth = "none";
          this.connectionOption.user = null;
          this.connectionOption.password = null;
          this.connectionOption.port = null;
          this.connectionOption.database = null;
          this.connectionOption.useSSL = false;
          break;
```

- [ ] **Step 5: Run UI test**

Run:

```bash
node test/kafkaUiConfig.test.js
```

Expected:

```text
kafkaUiConfig tests passed
```

- [ ] **Step 6: Commit UI task**

Run:

```bash
git add src/vue/connect/index.vue src/vue/connect/component/Kafka.vue test/kafkaUiConfig.test.js
git commit -m "feat: add kafka connection ui"
```

---

### Task 4: Kafka Message Webviews And Commands

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`
- Modify: `src/model/kafka/kafkaTopicNode.ts`
- Modify: `src/vue/main.js`
- Create: `src/vue/kafka/messageViewer.vue`
- Create: `src/vue/kafka/messageProducer.vue`
- Test: `test/kafkaWebviewRegistration.test.js`

**Interfaces:**
- Consumes: `KafkaTopicNode.topic`, `KafkaConnection.readMessages()`, and `KafkaConnection.sendMessage()`.
- Produces: command `airdb.kafka.topic.view`.
- Produces: command `airdb.kafka.topic.send`.
- Produces: app routes `kafkaMessageViewer` and `kafkaMessageProducer`.

- [ ] **Step 1: Add failing command and route test**

Create `test/kafkaWebviewRegistration.test.js`:

```js
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
assert.match(topicNode, /route', 'kafkaMessageViewer'/);
assert.match(topicNode, /route', 'kafkaMessageProducer'/);
assert.match(topicNode, /readKafkaMessages/);
assert.match(topicNode, /sendKafkaMessage/);

const main = read("src/vue/main.js");
assert.match(main, /kafkaMessageViewer/);
assert.match(main, /kafkaMessageProducer/);

assert.ok(fs.existsSync(path.resolve(__dirname, "../src/vue/kafka/messageViewer.vue")));
assert.ok(fs.existsSync(path.resolve(__dirname, "../src/vue/kafka/messageProducer.vue")));

console.log("kafkaWebviewRegistration tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node test/kafkaWebviewRegistration.test.js
```

Expected: FAIL because commands and webviews are missing.

- [ ] **Step 3: Add package command and menu contributions**

Modify `package.json` under `contributes.commands`:

```json
{
  "command": "airdb.kafka.topic.view",
  "title": "View Kafka Messages",
  "category": "AirDB",
  "icon": "$(eye)"
},
{
  "command": "airdb.kafka.topic.send",
  "title": "Send Kafka Message",
  "category": "AirDB",
  "icon": "$(send)"
}
```

Modify `contributes.menus["view/item/context"]`:

```json
{
  "command": "airdb.kafka.topic.view",
  "when": "view == activitybar.airdb.nosql && viewItem == kafkaTopic",
  "group": "inline@0"
},
{
  "command": "airdb.kafka.topic.send",
  "when": "view == activitybar.airdb.nosql && viewItem == kafkaTopic",
  "group": "inline@1"
}
```

Extend existing common connection menu regexes to include `kafkaConnection` where the behavior applies:

```text
connection edit/open/disable/delete/host copy: kafkaConnection
refresh: kafkaConnection|kafkaTopicGroup|kafkaTopic|kafkaConsumerGroup
```

- [ ] **Step 4: Register extension commands**

Modify `src/extension.ts` imports:

```ts
import { KafkaTopicNode } from "./model/kafka/kafkaTopicNode";
```

Add command definitions near the Redis block:

```ts
            // kafka
            ...{
                "airdb.kafka.topic.view": (topicNode: KafkaTopicNode) => topicNode.viewMessages(),
                "airdb.kafka.topic.send": (topicNode: KafkaTopicNode) => topicNode.sendMessage(),
            },
```

- [ ] **Step 5: Replace Kafka topic webview stubs**

Modify `src/model/kafka/kafkaTopicNode.ts` imports:

```ts
import { Global } from "@/common/global";
import { ViewManager } from "@/common/viewManager";
```

Replace `viewMessages()`:

```ts
    public viewMessages() {
        ViewManager.createWebviewPanel({
            title: `${this.topic} messages`,
            type: `kafka-message-viewer-${this.getConnectId()}-${this.topic}`,
            splitView: true,
            singlePage: false,
            path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", "kafkaMessageViewer");
                }).on("route-kafkaMessageViewer", () => {
                    handler.emit("config", {
                        node: {
                            key: this.key,
                            host: this.host,
                            port: this.port,
                            brokers: this.brokers,
                            clientId: this.clientId,
                            kafkaAuth: this.kafkaAuth,
                            user: this.user,
                            password: this.password,
                            useSSL: this.useSSL,
                            caPath: this.caPath,
                            clientCertPath: this.clientCertPath,
                            clientKeyPath: this.clientKeyPath,
                            connectTimeout: this.connectTimeout,
                            requestTimeout: this.requestTimeout,
                            dbType: this.dbType,
                        },
                        topic: this.topic,
                    });
                }).on("readKafkaMessages", async (options) => {
                    try {
                        const connection = await this.getKafkaConnection();
                        const rows = await connection.readMessages({
                            topic: this.topic,
                            partition: options.partition === "" || options.partition == null ? undefined : parseInt(options.partition),
                            startMode: options.startMode,
                            offset: options.offset,
                            limit: options.limit,
                        });
                        handler.emit("messages", rows);
                    } catch (error) {
                        handler.emit("error", error?.message || String(error));
                    }
                });
            },
        });
    }
```

Replace `sendMessage()`:

```ts
    public sendMessage() {
        ViewManager.createWebviewPanel({
            title: `${this.topic} producer`,
            type: `kafka-message-producer-${this.getConnectId()}-${this.topic}`,
            splitView: true,
            singlePage: false,
            path: "app",
            eventHandler: (handler) => {
                handler.on("init", () => {
                    handler.emit("route", "kafkaMessageProducer");
                }).on("route-kafkaMessageProducer", () => {
                    handler.emit("config", { topic: this.topic });
                }).on("sendKafkaMessage", async (payload) => {
                    try {
                        const connection = await this.getKafkaConnection();
                        const result = await connection.sendMessage({
                            topic: this.topic,
                            partition: payload.partition === "" || payload.partition == null ? undefined : parseInt(payload.partition),
                            key: payload.key || undefined,
                            value: payload.value || "",
                            headers: payload.headers || {},
                        });
                        handler.emit("sent", result);
                    } catch (error) {
                        handler.emit("error", error?.message || String(error));
                    }
                });
            },
        });
    }
```

Remove unused `Global` if the final file does not reference it.

- [ ] **Step 6: Add Vue routes**

Modify `src/vue/main.js` imports:

```js
import kafkaMessageViewer from "./kafka/messageViewer.vue";
import kafkaMessageProducer from "./kafka/messageProducer.vue";
```

Add routes:

```js
    { path: '/kafkaMessageViewer', component: kafkaMessageViewer, name: 'kafkaMessageViewer' },
    { path: '/kafkaMessageProducer', component: kafkaMessageProducer, name: 'kafkaMessageProducer' },
```

- [ ] **Step 7: Create message viewer webview**

Create `src/vue/kafka/messageViewer.vue`:

```vue
<template>
  <div class="kafka-page">
    <el-form :inline="true" size="small" class="toolbar">
      <el-form-item label="Topic">
        <el-input v-model="topic" disabled class="topic-input"></el-input>
      </el-form-item>
      <el-form-item label="Partition">
        <el-input v-model="form.partition" placeholder="all" class="small-input"></el-input>
      </el-form-item>
      <el-form-item label="Start">
        <el-select v-model="form.startMode" class="mode-input">
          <el-option label="Latest" value="latest"></el-option>
          <el-option label="Beginning" value="beginning"></el-option>
          <el-option label="Offset" value="offset"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="Offset" v-if="form.startMode == 'offset'">
        <el-input v-model="form.offset" class="small-input"></el-input>
      </el-form-item>
      <el-form-item label="Limit">
        <el-input-number v-model="form.limit" :min="1" :max="1000" controls-position="right"></el-input-number>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="el-icon-refresh" :loading="loading" @click="read">Read</el-button>
      </el-form-item>
    </el-form>
    <el-alert v-if="error" :title="error" type="error" show-icon class="message"></el-alert>
    <el-table :data="messages" stripe border size="small" height="calc(100vh - 96px)">
      <el-table-column prop="partition" label="Partition" width="90"></el-table-column>
      <el-table-column prop="offset" label="Offset" width="110"></el-table-column>
      <el-table-column prop="timestamp" label="Timestamp" width="170"></el-table-column>
      <el-table-column prop="key" label="Key" width="180" show-overflow-tooltip></el-table-column>
      <el-table-column prop="value" label="Value" min-width="300" show-overflow-tooltip></el-table-column>
      <el-table-column label="Headers" min-width="220" show-overflow-tooltip>
        <template slot-scope="scope">{{ JSON.stringify(scope.row.headers || {}) }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;

export default {
  data() {
    return {
      topic: "",
      loading: false,
      error: "",
      messages: [],
      form: {
        partition: "",
        startMode: "latest",
        offset: "",
        limit: 100,
      },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("config", ({ topic }) => {
        this.topic = topic;
      })
      .on("messages", (rows) => {
        this.loading = false;
        this.error = "";
        this.messages = rows || [];
      })
      .on("error", (message) => {
        this.loading = false;
        this.error = message;
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  methods: {
    read() {
      this.loading = true;
      this.error = "";
      vscodeEvent.emit("readKafkaMessages", this.form);
    },
  },
};
</script>

<style scoped>
.kafka-page {
  padding: 10px;
}
.toolbar {
  margin-bottom: 8px;
}
.topic-input {
  width: 260px;
}
.small-input {
  width: 110px;
}
.mode-input {
  width: 130px;
}
.message {
  margin-bottom: 8px;
}
</style>
```

- [ ] **Step 8: Create message producer webview**

Create `src/vue/kafka/messageProducer.vue`:

```vue
<template>
  <div class="kafka-page">
    <el-form label-width="90px" size="small">
      <el-form-item label="Topic">
        <el-input v-model="topic" disabled></el-input>
      </el-form-item>
      <el-form-item label="Partition">
        <el-input v-model="form.partition" placeholder="optional"></el-input>
      </el-form-item>
      <el-form-item label="Key">
        <el-input v-model="form.key" placeholder="optional"></el-input>
      </el-form-item>
      <el-form-item label="Headers">
        <el-input type="textarea" :autosize="{ minRows: 3 }" v-model="headersText" placeholder="{&quot;source&quot;:&quot;airdb&quot;}"></el-input>
      </el-form-item>
      <el-form-item label="Value">
        <el-input type="textarea" :autosize="{ minRows: 10 }" v-model="form.value"></el-input>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="el-icon-s-promotion" :loading="loading" @click="send">Send</el-button>
      </el-form-item>
    </el-form>
    <el-alert v-if="error" :title="error" type="error" show-icon class="message"></el-alert>
    <el-alert v-if="success" :title="success" type="success" show-icon class="message"></el-alert>
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
let vscodeEvent;

export default {
  data() {
    return {
      topic: "",
      loading: false,
      error: "",
      success: "",
      headersText: "{}",
      form: {
        partition: "",
        key: "",
        value: "",
      },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("config", ({ topic }) => {
        this.topic = topic;
      })
      .on("sent", (result) => {
        this.loading = false;
        this.error = "";
        this.success = `Sent: ${JSON.stringify(result)}`;
      })
      .on("error", (message) => {
        this.loading = false;
        this.success = "";
        this.error = message;
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  destroyed() {
    vscodeEvent.destroy();
  },
  methods: {
    send() {
      let headers = {};
      try {
        headers = this.headersText.trim() ? JSON.parse(this.headersText) : {};
      } catch (error) {
        this.error = `Invalid headers JSON: ${error.message}`;
        return;
      }
      this.loading = true;
      this.error = "";
      this.success = "";
      vscodeEvent.emit("sendKafkaMessage", { ...this.form, headers });
    },
  },
};
</script>

<style scoped>
.kafka-page {
  max-width: 920px;
  padding: 12px;
}
.message {
  margin-top: 8px;
}
</style>
```

- [ ] **Step 9: Run command and route test**

Run:

```bash
node test/kafkaWebviewRegistration.test.js
```

Expected:

```text
kafkaWebviewRegistration tests passed
```

- [ ] **Step 10: Commit webview task**

Run:

```bash
git add package.json src/extension.ts src/model/kafka/kafkaTopicNode.ts src/vue/main.js src/vue/kafka test/kafkaWebviewRegistration.test.js
git commit -m "feat: add kafka message webviews"
```

---

### Task 5: Build Verification

**Files:**
- Modify only files that fail typecheck or webpack build because of the Kafka implementation.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: buildable extension and webview bundle.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node test/kafkaConnectionConfig.test.js
node test/kafkaConnection.test.js
node test/kafkaTreeRegistration.test.js
node test/kafkaUiConfig.test.js
node test/kafkaWebviewRegistration.test.js
```

Expected:

```text
kafkaConnectionConfig tests passed
kafkaConnection tests passed
kafkaTreeRegistration tests passed
kafkaUiConfig tests passed
kafkaWebviewRegistration tests passed
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: webpack production build exits with code 0.

- [ ] **Step 3: Fix build failures with scoped edits**

When TypeScript reports a concrete error, edit the named file only. Keep the public interfaces from Tasks 1-4 unchanged unless the error proves a signature mismatch. After each edit, rerun:

```bash
npm run build
```

Expected: webpack production build exits with code 0.

- [ ] **Step 4: Commit verification fixes if any files changed**

Run:

```bash
git status --short
```

If files changed during Step 3:

```bash
git add <changed files>
git commit -m "fix: verify kafka build"
```

If no files changed during Step 3, do not create an empty commit.

---

## Self-Review

- Spec coverage: Tasks 1-4 cover connection management, broker config, SSL/SASL, NoSQL tree routing, topics, partitions, consumer groups, one-shot message reads, and message sends.
- First-version exclusions: No task adds live subscriptions, topic mutation, Schema Registry, Avro/Protobuf, Kafka Connect, transactions, ACLs, or cluster config editing.
- Dependency constraint: Task 1 uses only `kafkajs@2.2.4`.
- Type consistency: UI fields `brokers`, `clientId`, and `kafkaAuth` match `Node` fields and `createKafkaConfig()`.
- Verification: Task 5 runs all Kafka tests and `npm run build`.
