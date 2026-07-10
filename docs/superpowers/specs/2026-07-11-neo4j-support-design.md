# Neo4j Support Design

## Goal

Add Neo4j as a first-class NoSQL database type in AirDB. The first version should let users create a Neo4j connection, browse databases, labels, and relationship types, and run Cypher through the existing query/result surface without requiring any external Neo4j CLI.

## References

- Neo4j JavaScript Driver Manual: https://neo4j.com/docs/javascript-manual/current/
- Neo4j JavaScript Driver installation and compatibility: https://neo4j.com/docs/javascript-manual/current/install/
- Neo4j JavaScript Driver API: https://neo4j.com/docs/api/javascript-driver/current/
- `neo4j-driver` npm package: https://www.npmjs.com/package/neo4j-driver

The official JavaScript driver is `neo4j-driver`. The current npm version checked during design is `6.2.0`, so the implementation should use dependency range `^6.2.0`. Neo4j's current driver manual states the 6.x series supports Neo4j 4.4.x, 5.x, 2025.x, and 2026.x.

## Scope

The first Neo4j implementation includes:

- A `Neo4j` database type in the connection page and NoSQL tree.
- Neo4j logo support in the database selector and tree.
- Default host `127.0.0.1`, port `7687`, user `neo4j`, empty password, database `neo4j`, SSL disabled by default, connect timeout `5000`, and request timeout `10000`.
- Connection through the official `neo4j-driver` package.
- A `Neo4jConnection` wrapper that adapts the Bolt driver to AirDB's `IConnection` contract.
- Cypher query execution through the existing query/result display path.
- Result serialization for Neo4j integers, nodes, relationships, paths, lists, maps, temporal values, and spatial values into plain displayable JavaScript objects.
- NoSQL tree browsing for databases, labels, and relationship types.
- Focused tests covering registration, driver config, connection adapter behavior with a mocked driver, tree routing, and UI defaults.

The first version does not include:

- Graph canvas visualization.
- Node or relationship editing forms.
- APOC-specific workflows.
- Index, constraint, user, role, backup, or cluster administration panels.
- Long-running subscriptions or change streams.
- Live integration tests against a running Neo4j server.

## Architecture

Neo4j should be modeled as a NoSQL backend, not as a SQL dialect. It should use `CacheKey.NOSQL_CONNECTION`, appear in `activitybar.airdb.nosql`, and get dedicated model nodes under `src/model/neo4j/`. It should not reuse SQL schema/table nodes because labels and relationship types are graph metadata, not relational tables.

The implementation will add:

- `DatabaseType.NEO4J = "Neo4j"`
- `ModelType.NEO4J_CONNECTION = "neo4jConnection"`
- `ModelType.NEO4J_DATABASE_GROUP = "neo4jDatabaseGroup"`
- `ModelType.NEO4J_DATABASE = "neo4jDatabase"`
- `ModelType.NEO4J_LABEL_GROUP = "neo4jLabelGroup"`
- `ModelType.NEO4J_LABEL = "neo4jLabel"`
- `ModelType.NEO4J_RELATIONSHIP_GROUP = "neo4jRelationshipGroup"`
- `ModelType.NEO4J_RELATIONSHIP = "neo4jRelationship"`

`ConnectionManager` will route `DatabaseType.NEO4J` to `Neo4jConnection`. `DbTreeDataProvider.getKeyByNode()` will store Neo4j in the NoSQL connection key. `DbTreeDataProvider.getNode()` will create `Neo4jConnectionNode` for Neo4j saved connections.

The tree should use this first-version hierarchy:

```text
Neo4j connection
  Databases
    neo4j
    system
  Labels
    Person
    Movie
  Relationship Types
    ACTED_IN
    DIRECTED
```

Database nodes set the active `database` field for query execution and metadata reads. Label and relationship nodes are metadata leaves with query commands added later only if the existing menu system can support them without broad package changes.

## Connection Layer

Create `src/service/connect/neo4jConnection.ts`.

`createNeo4jConfig(node)` should normalize these fields:

- `host`: default `127.0.0.1`
- `port`: default `7687`
- `user`: default `neo4j`
- `password`: default empty string
- `database`: default `neo4j`
- `useSSL`: default `false`
- `connectTimeout`: default `5000`
- `requestTimeout`: default `10000`
- `connectionUrl`: optional override for the full URI

When `connectionUrl` is absent, the URI should be:

- `bolt://host:port` when `useSSL` is false.
- `bolt+s://host:port` when `useSSL` is true.

`Neo4jConnection.connect(callback)` should create a driver with `neo4j.driver(uri, neo4j.auth.basic(user, password), options)` and call `driver.verifyConnectivity()`.

`Neo4jConnection.query(cypher, callback)` should open a session with `{ database }`, run the Cypher text, consume records, serialize each field, and return rows through the existing callback shape. In EventEmitter mode, it should emit each serialized row through `result` and then `end`.

`beginTransaction`, `rollback`, and `commit` should be conservative no-ops that report Neo4j query execution as auto-commit for the first version. Full transaction support should be added later only if the query workspace starts exposing explicit transaction controls for non-SQL backends.

`end()` should close the driver and mark the connection not alive.

## Result Serialization

The connection adapter should convert Neo4j driver values into plain objects before returning them to AirDB:

- Neo4j Integer: number when safe, string when outside JavaScript safe integer range.
- Node: `{ identity, labels, properties, elementId }`
- Relationship: `{ identity, type, start, end, properties, elementId, startNodeElementId, endNodeElementId }`
- Path: `{ start, end, segments }`
- Arrays: recursively serialized arrays.
- Objects and maps: recursively serialized plain objects.
- Temporal, duration, and spatial values: use driver `toString()` or a stable plain object when the driver exposes coordinates.
- Null and scalar values: returned unchanged.

This keeps the query grid readable and avoids leaking driver-specific prototypes into Vue serialization.

## Metadata Browsing

`Neo4jConnection` should expose graph-specific methods for tree nodes:

- `listDatabases(): Promise<string[]>`
- `listLabels(database?: string): Promise<string[]>`
- `listRelationshipTypes(database?: string): Promise<string[]>`

The methods should use Cypher that is stable across modern Neo4j versions:

- Databases: `SHOW DATABASES YIELD name RETURN name ORDER BY name`
- Labels: `CALL db.labels() YIELD label RETURN label ORDER BY label`
- Relationship types: `CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType`

If `SHOW DATABASES` fails because the connected user lacks privileges, the database list should fall back to the configured database so the connection remains usable.

## Connection UI

Add `Neo4j` to `src/vue/connect/index.vue` near other NoSQL backends. Selecting Neo4j should set:

- `host`: `127.0.0.1`
- `port`: `7687`
- `user`: `neo4j`
- `password`: empty string
- `database`: `neo4j`
- `useSSL`: `false`
- `connectTimeout`: `5000`
- `requestTimeout`: `10000`

The generic connection form is enough for phase one. Neo4j should be included in the SSL switch list and should remain eligible for SSH tunneling. The existing generic connection string field can be reused if `useConnectionString` is enabled later, but first-version Neo4j support only needs the stored `connectionUrl` field as an optional backend override.

Add `resources/icon/neo4j.svg`. Prefer a real Neo4j SVG logo if one already exists in the local plugin assets; otherwise create a compact SVG that clearly identifies Neo4j and follows the current icon sizing.

## Packaging

Add `neo4j-driver` to `dependencies` as `^6.2.0`.

Because this project uses webpack 4, implementation must verify whether `neo4j-driver` bundles cleanly. If webpack fails or pulls in Node-specific dynamic modules, externalize it in `webpack.config.js`:

```js
'neo4j-driver': 'commonjs neo4j-driver'
```

If externalized, whitelist `node_modules/neo4j-driver/**` and any required runtime dependencies in `.vscodeignore`.

The implementation must run `npm run build` after dependency and packaging changes. Build warnings should be checked for new Neo4j-specific issues.

## Error Handling

Connection failures should surface through the existing connection error UI. Query failures should call the callback with the original error and emit `error` in EventEmitter mode.

Metadata failures should return an `InfoNode` containing the operation name and error message, such as `List Neo4j labels failed: <message>`, instead of breaking the whole tree.

Driver close failures during `end()` should be swallowed after the connection is marked dead, matching the current one-shot close behavior used by other backends.

## Testing

Add mocked tests that do not require a running Neo4j server:

- `test/neo4jRegistration.test.js`: verifies `DatabaseType.NEO4J`, `ModelType` entries, NoSQL routing, `Neo4jConnectionNode` creation, dependency registration, and icon registration.
- `test/neo4jConnectionConfig.test.js`: validates URI, auth, default database, timeout, SSL, and connectionUrl override mapping.
- `test/neo4jConnection.test.js`: uses a fake driver to test connectivity, Cypher query rows, EventEmitter mode, metadata methods, fallback database list, serialization, close behavior, and unsupported transaction no-ops.
- `test/neo4jUiConfig.test.js`: verifies Neo4j is in `supportDatabases`, defaults are set by the watcher, SSL is visible, and the logo path is wired.
- `test/neo4jTreeRegistration.test.js`: verifies tree nodes, context values, children, and error `InfoNode` behavior with a mocked connection.

Run Neo4j tests, nearby NoSQL regression tests for Kafka/RabbitMQ/S3, and `npm run build`.

## Rollout

Implement as normal feature commits. Version bump, packaging, and Marketplace publish are separate release steps unless explicitly requested after implementation.
