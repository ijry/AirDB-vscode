# Apache Doris Support Design

## Goal

Add Apache Doris as a first-class SQL database type in AirDB. The first version should let users create a Doris connection, browse databases/tables/views, open table data, and run SQL through the existing query workspace.

## References

- Apache Doris official MySQL protocol documentation: https://doris.apache.org/docs/4.x/connection-integration/mysql-proto/
- Apache Doris official FE load balancing documentation: https://doris.apache.org/docs/dev/admin-manual/cluster-management/load-balancing/
- Apache Doris official information_schema tables documentation: https://doris.apache.org/docs/3.x/admin-manual/system-tables/information_schema/tables/

The Doris documentation states that Doris FE exposes a MySQL-compatible protocol service on `query_port`, default `9030`, and mainstream MySQL drivers can connect without a Doris-specific driver.

## Scope

The first Doris implementation includes:

- A `Doris` database type in the connection page.
- Doris logo support in the database selector.
- Default host `127.0.0.1`, port `9030`, user `root`, empty password, and optional database.
- Connection through the existing `mysql2` dependency.
- A Doris-specific connection class that reuses MySQL protocol behavior without adding a new runtime dependency.
- A Doris dialect for metadata queries and templates that are safer for Doris than raw MySQL defaults.
- Integration with the SQL tree so Doris appears in the SQL view, not the NoSQL view.
- Query workspace support through the existing SQL query flow.
- Table data pagination through the existing MySQL-style page service.
- Tests covering registration, defaults, service routing, and dialect SQL.

The first version does not include:

- Doris Stream Load, Broker Load, Routine Load, or S3 load workflows.
- FE/BE node administration panels.
- Catalog browsing beyond the current AirDB database/table tree model.
- Doris materialized view management.
- Privilege editing or role management.
- A live Doris server integration test.

## Architecture

Doris is a SQL backend. It should use the existing SQL tree, query workspace, import/export entry points, and table data page. It should not be modeled as NoSQL and should not add a new VS Code view.

The implementation will add a new `DatabaseType.DORIS = "Doris"`. `ConnectionManager` will route Doris to a `DorisConnection`, which can extend `MysqlConnection` or wrap the same configuration path. The important difference is the default connection options and future type-specific extension point, not the wire protocol.

`ServiceManager.getDialect()` will return `DorisDialect`. `DorisDialect` should extend `MysqlDialect` but override Doris-sensitive SQL:

- `createDatabase(database)` should use `CREATE DATABASE \`name\`` without MySQL charset suffixes.
- `tableTemplate()` should produce a Doris-friendly OLAP table template with `ENGINE=OLAP`, `DUPLICATE KEY`, `DISTRIBUTED BY HASH`, and `PROPERTIES`.
- `showTables(database)` should query `information_schema.TABLES` for `TABLE_TYPE <> 'VIEW'`, selecting fields already consumed by the UI.
- `showViews(database)` should query `information_schema.VIEWS`.
- `showColumns(database, table)` should query `information_schema.COLUMNS` and map results to existing column field names.
- Source display should keep using `SHOW CREATE TABLE` / `SHOW CREATE VIEW` where available.

`ServiceManager.getPageService()` can reuse `MysqlPageSerivce` because Doris supports MySQL-style `LIMIT offset, count`.

`ServiceManager.getImportService()` and `getDumpService()` can initially fall back to existing MySQL-compatible services. Doris-specific bulk load is explicitly second phase because it needs a separate UI and HTTP/streaming behavior.

## Connection UI

Add `Doris` to `supportDatabases` near `ClickHouse` and `DuckDB`. Selecting Doris should set:

- `dbType`: `Doris`
- `host`: `127.0.0.1`
- `port`: `9030`
- `user`: `root`
- `password`: empty string
- `database`: empty string

The generic SQL connection form is enough for phase one. No Doris-specific Vue component is required.

The logo should use an SVG at `resources/icon/doris.svg`. If no existing local asset is present, create a simple Doris-branded SVG icon in the same style as the current database logos.

## Tree Data Flow

Doris connections stay under `CacheKey.DATBASE_CONECTIONS`.

`DbTreeDataProvider.getKeyByNode()` should treat Doris as SQL and not include it in the NoSQL list. `DbTreeDataProvider.getNode()` can create the standard `ConnectionNode`, matching MySQL, PostgreSQL, ClickHouse, and DuckDB behavior.

`ConnectionNode` should treat Doris like a database-listing SQL backend. The first version should not create catalog nodes for Doris. Doris databases should appear as database nodes containing table and view groups.

## Error Handling

Connection failures should surface through the existing connection error UI. Doris-specific failures are expected to mostly be MySQL protocol errors from `mysql2`, so the first version should not introduce custom error translation.

If `SHOW CREATE VIEW` or some `information_schema` field is unavailable on older Doris versions, the query should fail visibly through the existing query/table error path. The implementation should keep metadata SQL conservative to reduce this risk.

## Testing

Add unit tests that do not require a running Doris server:

- Doris is present in connect UI configuration with default port `9030`.
- `DatabaseType.DORIS` and `ModelType` routing keeps Doris in SQL tree registration paths.
- `ConnectionManager` creates `DorisConnection`.
- `ServiceManager.getDialect(DatabaseType.DORIS)` returns `DorisDialect`.
- `ServiceManager.getPageService(DatabaseType.DORIS)` returns MySQL-style pagination.
- `DorisDialect` emits Doris-safe SQL for create database, table template, tables, views, and columns.

Run the full existing JavaScript test suite and production build after implementation.

## Rollout

This should be implemented as a normal feature commit. Version bump and Marketplace publish are separate release steps unless explicitly requested after implementation.
