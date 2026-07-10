# TDengine Support Design

## Goal

Add TDengine as a first-class SQL database type in AirDB. The first version should let users create a TDengine connection through taosAdapter WebSocket, browse databases/tables/views, open table data, and run SQL through the existing query workspace without installing the native TDengine client on the user's machine.

## References

- TDengine official Node.js connector documentation: https://docs.tdengine.com/reference/connector/node/
- TDengine WebSocket connection concept: https://docs.tdengine.com/reference/connector/node/#establish-connection
- `@tdengine/websocket` npm package: https://www.npmjs.com/package/@tdengine/websocket

The official Node.js connector is `@tdengine/websocket`. It connects through taosAdapter's WebSocket API and avoids a local TDengine client/native driver dependency. The package currently requires Node.js 14+ and fits the extension host baseline better than native bindings.

## Scope

The first TDengine implementation includes:

- A `TDengine` database type in the connection page.
- TDengine logo support in the database selector and SQL tree.
- Default host `127.0.0.1`, port `6041`, user `root`, password `taosdata`, optional database, SSL disabled by default, connect timeout `5000`, and request timeout `10000`.
- Connection through the official `@tdengine/websocket` package.
- A TDengine-specific connection class that wraps the WebSocket driver and adapts result rows to AirDB's existing SQL connection interface.
- A TDengine dialect for metadata queries, pagination, source display, and SQL templates.
- Integration with the SQL tree so TDengine appears in the SQL view, not the NoSQL view.
- Query workspace support through the existing SQL query flow.
- Table data pagination through a TDengine-compatible page service or SQL dialect pagination path.
- Basic SQL import/export through existing generic SQL/CSV flows where the existing services can operate on a normal SQL connection.
- Tests covering registration, defaults, service routing, connection adapter behavior with a mocked driver, and dialect SQL.

The first version does not include:

- TDengine native client bindings or OCI-like local driver installation.
- Dedicated supertable/subtable management UI.
- Topic, stream, subscription, schemaless write, or line protocol workflows.
- Enterprise clustering, taosKeeper monitoring, or adapter administration panels.
- Bulk ingest through TDengine-specific optimized protocols beyond existing SQL import paths.
- Live integration tests against a running TDengine server and taosAdapter.

## Architecture

TDengine is a SQL backend. It should use the existing SQL tree, query workspace, import/export entry points, and table data page. It should not be modeled as NoSQL and should not add a new VS Code view.

The implementation will add `DatabaseType.TDENGINE = "TDengine"`. `ConnectionManager` will route TDengine to a new `TDengineConnection`. The connection class should be independent rather than extending `MysqlConnection`, because TDengine uses taosAdapter WebSocket and has different connection options, result shapes, and metadata behavior.

`TDengineConnection` will normalize AirDB `Node` fields into a WebSocket DSN or driver options:

- `host`: taosAdapter host, default `127.0.0.1`.
- `port`: taosAdapter port, default `6041`.
- `user`: username, default `root`.
- `password`: password, default `taosdata`.
- `database`: optional initial database.
- `useSSL`: chooses `wss` when true and `ws` when false.
- `connectTimeout`: connection timeout, default `5000`.
- `requestTimeout`: query timeout, default `10000`.

`ServiceManager.getDialect()` will return `TDengineDialect`. The dialect should be dedicated. It may copy small MySQL-style helpers where syntax overlaps, but it should not extend `MysqlDialect` blindly because TDengine table templates, metadata, and source display differ.

`ServiceManager.getPageService()` should route TDengine to a service that emits `SELECT * FROM <table> LIMIT <pageSize> OFFSET <offset>` or the existing compatible page service if it already uses that shape. The implementation must verify the exact current page service method contract before wiring it.

`ServiceManager.getImportService()` and `getDumpService()` can initially use the generic SQL path if no existing service assumes MySQL CLI tools or native client binaries. If the current generic services are not safe for TDengine, the first version should fall back to the base service behavior and tests should document that choice.

## Connection UI

Add `TDengine` to `supportDatabases` near `ClickHouse` and other analytical/time-series SQL engines. Selecting TDengine should set:

- `dbType`: `TDengine`
- `host`: `127.0.0.1`
- `port`: `6041`
- `user`: `root`
- `password`: `taosdata`
- `database`: empty string
- `useSSL`: `false`
- `connectTimeout`: `5000`
- `requestTimeout`: `10000`

The generic SQL connection form is enough for phase one. No TDengine-specific Vue component is required because host, port, user, password, database, timeout, SSL, and SSH fields cover the taosAdapter connection shape.

The logo should use an SVG at `resources/icon/tdengine.svg`. If no existing local asset is present, create a compact TDengine SVG in the same icon style as the current database logos.

TDengine should be included in the SSL option list because taosAdapter can be exposed through `wss`. It should also remain eligible for SSH tunneling because the connection target is a normal host and port.

## Tree Data Flow

TDengine connections stay under `CacheKey.DATBASE_CONECTIONS`.

`DbTreeDataProvider.getKeyByNode()` should treat TDengine as SQL and not include it in the NoSQL list. `DbTreeDataProvider.getNode()` can create the standard `ConnectionNode`, matching MySQL, Doris, ClickHouse, and DuckDB behavior.

The SQL tree should model TDengine like a database-listing SQL backend:

```text
TDengine connection
  database
    tables
    views
```

The first version should not add an extra supertable/subtable hierarchy. TDengine users can still inspect supertables and child tables through the table list and SQL query page, and a specialized hierarchy can be added later after the basic backend is stable.

## Query Behavior

`TDengineConnection.query(sql, callback)` should execute SQL through the WebSocket driver. When a callback is present, SELECT/SHOW/DESCRIBE result rows are returned directly. For DML/DDL without rows, the adapter should return an object with `affectedRows` when the driver exposes affected-row metadata, otherwise `{ affectedRows: 0 }`.

When no callback is present, the adapter should return an `EventEmitter` and emit each result row through `result`, matching the dump/export pattern used by other SQL connections.

Transactions should be conservative. If TDengine does not support the same transaction semantics as conventional OLTP databases, `beginTransaction`, `rollback`, and `commit` should call their callback without issuing unsupported SQL or should use the safest documented SQL only after verification. Tests should lock in the chosen behavior.

## Metadata SQL

TDengine dialect methods should use SQL that matches AirDB's expected aliases:

- Databases: `SHOW DATABASES`, normalized as `"Database"`.
- Tables: `INFORMATION_SCHEMA.INS_TABLES` or `SHOW TABLES`, returning `"name"` and optional `"comment"` when available.
- Views: return an empty query or a conservative metadata query if the connected TDengine version exposes views in a stable catalog table.
- Columns: `DESCRIBE <table>` or information schema columns, returning `"name"`, `"simpleType"`, `"type"`, `"nullable"`, `"defaultValue"`, `"comment"`, and `"key"` aliases where available.
- Source: use `SHOW CREATE TABLE <table>` when available.
- Count: `SELECT COUNT(*) FROM <table>`.
- Page: `SELECT * FROM <table> LIMIT <pageSize> OFFSET <offset>`.

Identifier and literal escaping must be implemented in the dialect. Identifiers should use backticks and double embedded backticks. String literals should escape single quotes.

## Packaging

The package `@tdengine/websocket` should be added to `dependencies`. Because this project uses webpack 4 for extension bundling, the implementation should verify whether the package bundles cleanly. If it pulls in dynamic runtime dependencies or Node-specific modules that webpack cannot statically bundle, externalize `@tdengine/websocket` in `webpack.config.js` and whitelist the package plus required runtime dependencies in `.vscodeignore`.

The implementation should run `npm run build` after dependency and webpack changes. Any new build warning should be traced to the dependency graph and either fixed or documented in the final result.

## Error Handling

Connection failures should surface through the existing connection error UI. Query failures should call the callback with the original error and emit `error` in EventEmitter mode.

Transport failures should mark the connection dead where the driver exposes enough signal. Non-transport SQL errors should not permanently kill the connection.

If metadata queries fail because a TDengine version lacks a catalog table, the error should be visible through the existing tree/table error path. The first version should prefer conservative metadata SQL and focused tests rather than hiding incompatible server behavior.

## Testing

Add unit tests that do not require a running TDengine server:

- TDengine is present in connect UI configuration with default port `6041`, default user `root`, default password `taosdata`, default database empty, and SSL disabled.
- TDengine logo path is registered in the connection UI and SQL tree.
- `DatabaseType.TDENGINE` and tree routing keep TDengine in SQL registration paths.
- `ConnectionManager` creates `TDengineConnection`.
- `TDengineConnection` normalizes missing defaults and passes WebSocket options to the driver.
- `TDengineConnection` adapts query rows, DDL affected-row results, EventEmitter dump mode, and close behavior with a mocked driver.
- `ServiceManager.getDialect(DatabaseType.TDENGINE)` returns `TDengineDialect`.
- `ServiceManager.getPageService(DatabaseType.TDENGINE)` returns a TDengine-compatible pagination path.
- `TDengineDialect` emits TDengine-safe SQL for databases, tables, columns, table source, count, page, and templates.
- Packaging tests verify `package.json`, webpack externals if used, and `.vscodeignore` runtime dependency rules if used.

Run focused TDengine tests, nearby Doris/ClickHouse/DuckDB/Snowflake regression tests, and `npm run build` after implementation.

## Rollout

This should be implemented as normal feature commits. Version bump and Marketplace publish are separate release steps unless explicitly requested after implementation.
