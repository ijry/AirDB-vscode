# Oracle Thin Driver Support Design

## Purpose

Add first-class Oracle Database support to AirDB without requiring Oracle Instant Client, OCI, or native client installation. The implementation will use the official `oracledb` Node package in Thin mode only. AirDB must not call `oracledb.initOracleClient()`.

## Scope

The first release supports the core SQL client workflow:

- Create, edit, test, save, and open Oracle connections.
- Connect with host, port, service name, username, and password.
- Reuse the existing SSH tunnel path for Oracle connections.
- Show Oracle schemas, tables, views, and columns in the left database tree.
- Open the dedicated SQL query workspace from Oracle connection, schema, table, and query actions.
- Execute SQL and display result sets in the existing result grid.
- Page Oracle queries with Oracle 12c+ `OFFSET ... FETCH NEXT ...` syntax.

The first release does not include Oracle-specific export/import, structure diff, PL/SQL package browsing, procedure/function/trigger management, SID-first configuration, wallet support, or OCI Thick mode fallback.

## Driver Choice

Use `oracledb` Thin mode:

- Package: `oracledb`
- Mode: Thin mode only
- License: `Apache-2.0 OR UPL-1.0`
- Runtime requirement: no Oracle Client libraries

Thin mode is the correct fit because the user explicitly wants no OCI dependency and AirDB is distributed as a VS Code extension where native client installation would make setup brittle.

## Architecture

Add `DatabaseType.ORACLE = "Oracle"` and route it through the same extension seams used by MySQL, PostgreSQL, MSSQL, and SQLite.

New backend units:

- `OracleConnection` implements `IConnection` and adapts `oracledb` results to AirDB's callback shape.
- `OracleDialect` extends the SQL dialect layer with Oracle metadata SQL.
- `OraclePageService` builds paged SQL using `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY`.

Existing dispatch points will add Oracle cases:

- `ConnectionManager.create()`
- `ServiceManager.getDialect()`
- `ServiceManager.getPageService()`
- connection form database type options
- connection/tree icon handling where type-specific icons are already selected

## Connection Model

AirDB will continue storing connection details on the existing `Node` shape.

Oracle will use:

- `host`
- `port`, default `1521`
- `user`
- `password`
- `database` as the Oracle service name
- `connectTimeout`
- `requestTimeout`
- existing `usingSSH` and `ssh` fields

The UI label can display `host@port`; schema activation will use the selected schema/user from the tree. SID support is intentionally deferred so the first version has a clear service-name path.

## Data Flow

Connection test:

1. User selects Oracle in the connection form.
2. `ConnectService.connect()` trims and normalizes the `Node`.
3. `ConnectionManager.getConnection()` creates an `OracleConnection`.
4. `OracleConnection.connect()` opens a Thin connection with `oracledb.getConnection()`.
5. Success saves the node through the existing provider path.

Tree loading:

1. Root connection loads accessible schemas using `OracleDialect.showDatabases()`, backed by `SELECT DISTINCT OWNER FROM ALL_OBJECTS ... ORDER BY OWNER`.
2. Schema nodes load table and view groups using the existing group model.
3. Table and view groups call Oracle metadata SQL for object names.
4. Table nodes load columns through Oracle metadata SQL.

Query execution:

1. `QueryUnit.runQuery()` obtains `OracleConnection`.
2. `OracleConnection.query()` executes SQL through `oracledb.execute()`.
3. Results are returned as row objects plus fields shaped like AirDB expects.
4. `QueryPage` and `QueryWorkspacePage` render through the existing result UI.

## SQL Metadata

Oracle metadata should use dictionary views that are available to normal users:

- Schemas/users: distinct `OWNER` values from `ALL_OBJECTS`, filtered to accessible objects.
- Tables: `ALL_TABLES` filtered by `OWNER`.
- Views: `ALL_VIEWS` filtered by `OWNER`.
- Columns: `ALL_TAB_COLUMNS` filtered by `OWNER` and `TABLE_NAME`.

Object names should be uppercased for metadata filters unless the user entered quoted identifiers. Display names should preserve Oracle's returned names.

## Result Adaptation

`OracleConnection.query()` will normalize:

- `result.rows` to an array of objects.
- `result.metaData` to `FieldInfo[]` with at least `name`.
- DML row counts to `{ affectedRows: result.rowsAffected || 0 }`.

The driver should request object rows, not positional arrays, to match the rest of AirDB's result pipeline.

Transactions will map to SQL statements:

- `beginTransaction`: mark transaction state and call callback.
- `commit`: `connection.commit()`
- `rollback`: `connection.rollback()`

## Error Handling

Connection errors should propagate the original Oracle error message to the connection form.

Query errors should follow the existing `QueryUnit` behavior and display the error in the result workspace. If a connection becomes unusable, `OracleConnection` should mark itself dead so `ConnectionManager` reconnects on the next query.

Unsupported first-release features should degrade to generic SQL behavior instead of crashing. For example, export and structure diff can continue using generic service behavior or be disabled later if Oracle-specific SQL is required.

## Testing

Add unit-level tests where possible without a live Oracle server:

- `OraclePageService.build()` wraps basic SELECT SQL with Oracle 12c pagination.
- `OracleConnection` result adaptation converts mocked `oracledb` results into AirDB rows and fields.
- `OracleDialect` metadata SQL includes owner/table filters correctly.

Manual verification with a real Oracle database is required before release:

- Connection test succeeds with service name.
- Schema list loads.
- Table list, view list, and columns load.
- `select * from <schema>.<table>` shows rows.
- Pagination requests subsequent pages.
- SSH tunnel connection still works.

## Rollout

Ship Oracle support in one minor/patch release after manual database verification. Release notes should explicitly say Oracle uses `oracledb` Thin mode and does not require Oracle Instant Client.
