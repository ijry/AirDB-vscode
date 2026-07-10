# ZooKeeper Support Design

## Goal

Add Apache ZooKeeper as a first-class NoSQL connection type in AirDB. The first version lets users create a ZooKeeper connection, browse znodes from a configured root path, and open znode data as a temporary text/JSON file without requiring a native ZooKeeper client or external CLI.

## References

- `node-zookeeper-client` npm package: https://www.npmjs.com/package/node-zookeeper-client
- `zookeeper` npm package: https://www.npmjs.com/package/zookeeper
- npm search result for ZooKeeper clients: https://www.npmjs.com/search?page=0&perPage=20&q=keywords%3Azookeeper

`node-zookeeper-client` is the best fit for this extension because npm lists it as a pure JavaScript ZooKeeper client. The `zookeeper` package is newer, but its npm page states that it is implemented on top of the official ZooKeeper C Client API, and its dependency list includes native build tooling such as `nan` and `node-gyp-build`. AirDB should avoid that native packaging risk for a VSIX backend when a pure JavaScript option exists.

## Scope

The first ZooKeeper implementation includes:

- A `ZooKeeper` database type in the connection page.
- Storage under `CacheKey.NOSQL_CONNECTION`.
- A dedicated `ZooKeeperConnection` adapter using `node-zookeeper-client`.
- Default host `127.0.0.1`, port `2181`, root path `/`, optional `digest` authentication using the existing username/password fields, connect timeout `5000`, and request timeout `10000`.
- A NoSQL tree hierarchy where a connection expands to its root znode and child znodes recursively.
- Znode data preview through a command that writes up to a bounded number of bytes to a temporary file and opens it in VS Code.
- Focused tests for dependency/registration, connection config, mocked connection behavior, tree routing, UI defaults, and command registration.

The first version does not include:

- Creating, updating, or deleting znodes.
- Watch subscriptions or live refresh.
- ACL editing.
- Multi-operation transactions.
- Query workspace integration.
- Live integration tests against a running ZooKeeper server.

## Architecture

ZooKeeper is a hierarchical coordination service, so it should be modeled as a NoSQL tree backend rather than a SQL dialect. Saved connections belong in the existing NoSQL view. The model layer should live under `src/model/zookeeper/` and should not reuse database schema/table nodes.

The implementation will add:

- `DatabaseType.ZOOKEEPER = "ZooKeeper"`
- `ModelType.ZOOKEEPER_CONNECTION = "zookeeperConnection"`
- `ModelType.ZOOKEEPER_ZNODE = "zookeeperZnode"`
- `src/service/connect/zookeeperConnection.ts`
- `src/model/zookeeper/zookeeperBaseNode.ts`
- `src/model/zookeeper/zookeeperConnectionNode.ts`
- `src/model/zookeeper/zookeeperZnodeNode.ts`

`ConnectionManager` routes `DatabaseType.ZOOKEEPER` to `ZooKeeperConnection`. `DbTreeDataProvider.getKeyByNode()` stores ZooKeeper under `CacheKey.NOSQL_CONNECTION`, and `DbTreeDataProvider.getNode()` creates `ZooKeeperConnectionNode` for saved ZooKeeper connections.

The tree should use this hierarchy:

```text
ZooKeeper connection
  /
    brokers
      ids
    config
    zookeeper
```

Each znode expands to its children. Nodes with data expose an open command. Empty znodes can still be opened; the preview file will contain an empty string.

## Connection Layer

Create `src/service/connect/zookeeperConnection.ts`.

`createZooKeeperConfig(node)` normalizes:

- `connectionString`: `connectionUrl` when present, otherwise comma-separated `host` values with `port` appended when missing.
- `rootPath`: `database` when present, otherwise `/`.
- `authScheme`: `zookeeperAuthScheme` when present, otherwise `digest`.
- `authValue`: `user:password` when either field is present.
- `connectTimeout`: default `5000`.
- `requestTimeout`: default `10000`.

`ZooKeeperConnection.connect(callback)` creates a client with `node-zookeeper-client.createClient(connectionString, options)`, registers `connected`, `error`, and timeout handling, adds auth info when configured, and marks the connection alive only after the connected event.

The adapter exposes:

- `listChildren(path: string): Promise<string[]>`
- `getData(path: string): Promise<Buffer>`
- `getStat(path: string): Promise<any>`
- `getRootPath(): string`

`query`, transactions, rollback, and commit are unsupported and should report explicit errors through the existing `IConnection` contract.

## Tree And Preview

`ZooKeeperConnectionNode` represents the saved connection and returns one `ZooKeeperZnodeNode` for the configured root path. `ZooKeeperZnodeNode` lists children via `listChildren(path)` and maps child names to full znode paths.

`ZooKeeperZnodeNode.open()` gets znode data through `getData(path)`, rejects previews larger than `1 MB`, writes a temporary file through `FileManager.record()`, and opens it with `vscode.open`. Data should be saved as UTF-8 text when possible. If the content looks like JSON, use `.json`; otherwise use `.txt`.

Metadata failures should return `InfoNode` entries such as `List ZooKeeper children failed: <message>` instead of failing the whole tree.

## Connection UI

Add `ZooKeeper` to `src/vue/connect/index.vue` near the other NoSQL backends. Selecting it should set:

- `host`: `127.0.0.1`
- `port`: `2181`
- `user`: empty string
- `password`: empty string
- `database`: `/`
- `useSSL`: `false`
- `connectTimeout`: `5000`
- `requestTimeout`: `10000`

The generic host/port/user/password/database form is enough for the first version. The database label remains generic in this phase; the value is documented internally as the ZooKeeper root path. ZooKeeper remains eligible for SSH tunneling.

Add `resources/icon/zookeeper.svg` and wire it into the connection type selector.

## Packaging

Add `node-zookeeper-client` with dependency range `^1.1.3`. Because it is pure JavaScript, it can be bundled by webpack unless the build shows a new issue. If webpack has trouble with dynamic requires, externalize it in `webpack.config.js` and whitelist `node_modules/node-zookeeper-client/**`, `node_modules/async/**`, and `node_modules/underscore/**` in `.vscodeignore`.

## Testing

Add mocked tests that do not require a running ZooKeeper server:

- `test/zookeeperRegistration.test.js`
- `test/zookeeperConnectionConfig.test.js`
- `test/zookeeperConnection.test.js`
- `test/zookeeperUiConfig.test.js`
- `test/zookeeperTreeRegistration.test.js`

Run the ZooKeeper tests, nearby NoSQL regression tests for Kafka/RabbitMQ/S3/Neo4j, and `npm run build`.

## Rollout

Implement as a feature commit. Version bump and publish are separate release steps unless explicitly requested after implementation.
