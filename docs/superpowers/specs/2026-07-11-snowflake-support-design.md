# Snowflake Support Design

## Goal

Add Snowflake as a first-class SQL connection type in AirDB so users can create a Snowflake connection, browse databases/schemas/tables/views, open query pages, and run paginated SQL queries through the existing SQL workflow.

## Scope

- Register `Snowflake` in the SQL database type list, connection manager, service manager, tree icons, and connection UI.
- Use the official Snowflake Node.js driver package `snowflake-sdk`.
- Pin the dependency to `^1.15.0` for this project. `snowflake-sdk@3.x` currently requires Node.js 20+, while this extension still declares VS Code `^1.73.0`, whose extension host may run older Node versions.
- Support username/password authentication with Snowflake account, warehouse, database, schema, role, SSL, connect timeout, and request timeout options.
- Browse metadata via Snowflake `INFORMATION_SCHEMA` and `SHOW DATABASES`.
- Reuse the existing PostgreSQL page service because Snowflake supports `LIMIT ... OFFSET ...`.
- Reuse the existing SQL query workspace and table/view tree patterns.

## Out Of Scope

- Browser SSO, OAuth, MFA workflows, key-pair authentication, and external browser authenticators.
- Snowflake stage file operations such as `PUT`, `GET`, `COPY INTO`, unload workflows, and warehouse administration.
- Live integration tests against a real Snowflake account. The automated tests will verify registration, connection adapter behavior with a mocked SDK, dialect SQL generation, service routing, and UI configuration.

## Architecture

Snowflake gets its own connection adapter at `src/service/connect/snowflakeConnection.ts`. The adapter wraps `snowflake-sdk.createConnection`, maps AirDB `Node` fields into Snowflake driver options, implements `connect`, `query`, `isAlive`, transaction methods, and `end`, then adapts query results to the same callback shape used by current SQL backends.

Snowflake gets a dedicated dialect at `src/service/dialect/snowflakeDialect.ts`. The dialect should not extend PostgreSQL because Snowflake DDL/templates and metadata SQL are different, but it can follow PostgreSQL/Redshift column aliases so existing tree/table UI keeps working.

The tree should treat Snowflake like PostgreSQL and Redshift: connection nodes have a catalog/database layer, catalog nodes have schema children, schema nodes have table/view/query/procedure/function/trigger groups, and table pin/filter state uses the catalog plus schema key.

The connection page keeps the current tab-based database selector and adds a Snowflake-specific component for `Account`, `Warehouse`, `Role`, `Schema`, and `Authenticator`. Generic `Host` remains optional fallback input for users who know the full Snowflake host; the SDK primarily uses `account`.

## Data Mapping

- `Node.account`: Snowflake account identifier such as `xy12345.ap-southeast-1.aws`.
- `Node.host`: optional advanced Snowflake host override.
- `Node.port`: defaults to `443` for connection identity and SSH/SSL consistency, but Snowflake SDK does not need users to edit it in the common case.
- `Node.user`: Snowflake username.
- `Node.password`: password.
- `Node.database`: initial database.
- `Node.schema`: initial schema, default `PUBLIC`.
- `Node.warehouse`: initial warehouse.
- `Node.role`: optional role.
- `Node.authenticator`: default `SNOWFLAKE`.
- `Node.useSSL`: default `true`.

## Query Behavior

`SnowflakeConnection.query(sql, callback)` executes `connection.execute({ sqlText, complete })`. When a callback is present, SELECT/SHOW/DESCRIBE result rows are returned directly. For DML/DDL without rows, the adapter returns `{ affectedRows }`, using `statement.getNumRowsAffected()` when available.

When no callback is present, the adapter returns an `EventEmitter` and emits each result row through `result`, matching the dumping pattern used by `PostgreSqlConnection`.

Transactions use `BEGIN`, `ROLLBACK`, and `COMMIT`.

## Metadata SQL

- Databases: `SHOW DATABASES`, normalized as `"Database"` using `RESULT_SCAN(LAST_QUERY_ID())`.
- Schemas: `INFORMATION_SCHEMA.SCHEMATA`, returning `"Database"` and `"schema"`.
- Tables: `INFORMATION_SCHEMA.TABLES`, returning `"name"` and `"comment"`.
- Views: `INFORMATION_SCHEMA.VIEWS`, returning `"name"`.
- Columns: `INFORMATION_SCHEMA.COLUMNS`, returning aliases already consumed by AirDB table detail UI.
- Source: use `GET_DDL('TABLE', ...)` and `GET_DDL('VIEW', ...)` where practical.

## Error Handling

Connection errors should be passed to the existing connect callback and shown by the current UI. Query errors should call the callback with the original error, mark the connection dead for transport-level failures, and emit `error` when the EventEmitter path is used.

## Testing

Add focused Node tests:

- Registration test for enum, connection manager, service manager, tree behavior, and icon path.
- Connection test mocking `snowflake-sdk`.
- Dialect test validating metadata SQL, escaping, and Snowflake templates.
- Service integration test validating dialect/page/import/dump routing.
- UI config test validating the tab, logo, defaults, SSL support, and Snowflake component rendering.

Run Snowflake focused tests, nearby Redshift/Doris/S3 regression tests, and `npm run build`.
