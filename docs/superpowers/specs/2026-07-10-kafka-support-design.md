# Kafka Support Design

## Goal

Add Apache Kafka support to AirDB as a NoSQL connection type. The first version supports connection management, topic and consumer group browsing, one-shot message reads, and manual message production.

## Scope

Kafka support includes:

- A `Kafka` database type in the connection page and NoSQL tree.
- Broker connection with `brokers`, `clientId`, optional SSL, and optional SASL username/password.
- Topic browsing with partitions, leaders, replicas, ISR, beginning offsets, and end offsets.
- Consumer group browsing with group id, state when available, protocol type, members, and offsets.
- Message viewing by topic, partition, start offset mode, and limit.
- Message sending by topic, optional partition, optional key, value, and headers.

Kafka support does not include in the first version:

- Long-running live subscription panels.
- Topic create/delete or partition reassignment.
- Schema Registry integration.
- Avro/Protobuf decoding.
- Kafka Connect, transactions, ACL management, or cluster configuration editing.

## Dependency

Use `kafkajs@2.2.4`. It is a pure Node.js Kafka client, which avoids native compilation and packaging risk in the VS Code extension. The version was checked with `npm view kafkajs version`.

Primary references:

- KafkaJS admin client: https://kafka.js.org/docs/admin
- KafkaJS producing: https://kafka.js.org/docs/producing
- KafkaJS consuming: https://kafka.js.org/docs/consuming
- KafkaJS configuration: https://kafka.js.org/docs/configuration

## Architecture

Kafka is modeled as a NoSQL connection, similar to Redis and ElasticSearch. It uses `CacheKey.NOSQL_CONNECTION`, appears in `activitybar.airdb.nosql`, and has dedicated model nodes instead of trying to reuse SQL schema/table nodes.

The connection layer provides a focused `KafkaConnection` wrapper around KafkaJS. It exposes broker connectivity checks, admin operations, short-lived consumers for message reads, and producer operations for manual sends. Tree nodes call Kafka-specific methods directly instead of passing Kafka operations through SQL query strings.

The UI uses existing connection form conventions. Kafka gets a small connection-specific component for brokers and authentication, plus webview pages for message viewing and sending. Topic metadata remains in the tree for quick navigation; message content uses a webview because it needs filters, payload formatting, and send controls.

## Components

### Connection UI

Add Kafka to `src/vue/connect/index.vue` with a `KA` logo and defaults:

- `dbType`: `Kafka`
- `host`: `127.0.0.1:9092`
- `port`: `null`
- `clientId`: `airdb`
- `kafkaAuth`: `none`
- `useSSL`: `false`

Create `src/vue/connect/component/Kafka.vue` for:

- Brokers input, comma-separated.
- Client ID.
- Authentication mode: none, SASL plain, SASL SCRAM-SHA-256, SASL SCRAM-SHA-512.
- Username and password for SASL modes.
- SSL toggle via the existing SSL component.

### Connection Model

Add:

- `DatabaseType.KAFKA = "Kafka"`
- `ModelType.KAFKA_CONNECTION`
- `ModelType.KAFKA_TOPIC_GROUP`
- `ModelType.KAFKA_TOPIC`
- `ModelType.KAFKA_PARTITION`
- `ModelType.KAFKA_CONSUMER_GROUP`
- `ModelType.KAFKA_CONSUMER_GROUP_ITEM`

Kafka nodes live under `src/model/kafka/`:

- `kafkaConnectionNode.ts`: root node for one Kafka connection.
- `kafkaTopicGroupNode.ts`: container for topics.
- `kafkaTopicNode.ts`: one topic with commands to view and send messages.
- `kafkaPartitionNode.ts`: one partition with offset metadata.
- `kafkaConsumerGroupNode.ts`: container for consumer groups.
- `kafkaConsumerGroupItemNode.ts`: one consumer group.

### Connection Service

Create `src/service/connect/kafkaConnection.ts`.

Responsibilities:

- Build KafkaJS config from `Node`.
- Validate connection using `admin.connect()` and `admin.listTopics()`.
- Expose `getAdmin()`, `withAdmin()`, `readMessages()`, `sendMessage()`, `end()`, and `isAlive()`.
- Avoid unhandled events by catching all connect, admin, consumer, and producer errors and returning them through promises or callbacks.

Kafka-specific node fields:

- `brokers?: string`
- `clientId?: string`
- `kafkaAuth?: "none" | "plain" | "scram-sha-256" | "scram-sha-512"`

The existing `host` field stores the broker list for compatibility with saved connection display. `brokers` stores the normalized comma-separated broker list for Kafka-specific behavior.

### Tree Data Flow

`DbTreeDataProvider.getKeyByNode()` stores Kafka in `CacheKey.NOSQL_CONNECTION`.

`DbTreeDataProvider.getNode()` creates `KafkaConnectionNode` when `dbType == DatabaseType.KAFKA`.

`KafkaConnectionNode.getChildren()` returns:

- `KafkaTopicGroupNode`
- `KafkaConsumerGroupNode`

Topic group loads topic names through Kafka Admin and produces topic nodes. Topic nodes load partition metadata and offsets lazily. Consumer group nodes use Admin group APIs and load group details lazily.

### Message Viewer

Create a Kafka webview route under the existing app bundle:

- `src/vue/kafka/messageViewer.vue`

Inputs:

- topic
- partition
- start mode: beginning, latest, offset
- offset
- limit

Output rows:

- offset
- timestamp
- key
- value
- headers
- partition

Message reads use a short-lived consumer with a generated group id such as `airdb-preview-${Date.now()}`. It subscribes to one topic, seeks when an explicit offset is requested, collects up to `limit`, then disconnects.

### Message Producer

Create:

- `src/vue/kafka/messageProducer.vue`

Inputs:

- topic
- optional partition
- optional key
- value
- headers as JSON object

The producer sends one message through KafkaJS and returns topic, partition, offset, and timestamp when Kafka reports them.

## Error Handling

Connection errors display in the connection page using the existing `connect.errorMessage` flow.

Tree metadata errors return an `InfoNode` with the error message rather than breaking the tree.

Message read and send errors are displayed in the webview panel. Error messages include the Kafka operation that failed: connect, list topics, describe topic, fetch offsets, read messages, or send message.

Kafka connections always disconnect admin, consumer, and producer clients in `finally` blocks for one-shot operations.

## Testing

Add focused tests:

- `test/kafkaConnectionConfig.test.js`: validates KafkaJS config mapping for brokers, clientId, SSL, and SASL.
- `test/kafkaConnection.test.js`: uses a fake KafkaJS driver to test connect, list topics, offsets, read messages, send message, and cleanup.
- `test/kafkaTreeRegistration.test.js`: verifies `DatabaseType.KAFKA`, NoSQL routing, `KafkaConnectionNode`, and `ConnectionManager` registration.
- `test/kafkaUiConfig.test.js`: verifies Kafka logo, support list, defaults, SSL visibility, and auth UI component registration.

Run existing NoSQL and connection tests where available, plus `npm run build`.

## Packaging

`kafkajs` is bundled through webpack as a normal npm dependency. No vendored driver directory is needed, and no external Kafka CLI is required.

## Manual Verification

Before release, verify against a real Kafka cluster:

- Plaintext Kafka at `127.0.0.1:9092`.
- SSL Kafka if available.
- SASL/plain Kafka if available.
- Topic list and partition metadata.
- Consumer group list and offsets.
- Read latest messages from a topic.
- Read from an explicit partition offset.
- Send plain text message.
- Send JSON message with key and headers.
- SSH tunnel path for Kafka brokers.
