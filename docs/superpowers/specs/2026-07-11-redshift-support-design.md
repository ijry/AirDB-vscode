# Amazon Redshift Support Design

## Goal

Add Amazon Redshift as a first-class SQL database type in AirDB. The first version should let users create a Redshift connection, browse databases/schemas/tables/views, open table data, and run SQL through the existing query workspace.

## References

- Amazon Redshift connection string examples: https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-connecting.html
- Amazon Redshift `SHOW TABLES`: https://docs.aws.amazon.com/redshift/latest/dg/r_SHOW_TABLES.html
- Amazon Redshift `SHOW COLUMNS`: https://docs.aws.amazon.com/redshift/latest/dg/r_SHOW_COLUMNS.html
- Amazon Redshift system views and catalog tables: https://docs.aws.amazon.com/redshift/latest/dg/cm_chap_system-tables.html

The AWS documentation shows Redshift client connection strings using port `5439`. Redshift is PostgreSQL-derived, but it has enough metadata and DDL differences that AirDB should expose a dedicated Redshift type instead of silently treating it as PostgreSQL.

## Scope

The first Redshift implementation includes:

- A `Redshift` database type in the connection page.
- Redshift logo support in the database selector and SQL tree.
- Default host `127.0.0.1`, port `5439`, user `awsuser`, database `dev`, SSL enabled, and empty password.
- Connection through the existing `pg` dependency.
- A Redshift-specific connection class that reuses PostgreSQL protocol behavior while applying Redshift defaults.
- A Redshift dialect for metadata queries and templates that avoid PostgreSQL-only catalog functions where practical.
- Integration with the SQL tree so Redshift appears in the SQL view, not the NoSQL view.
- Query workspace support through the existing SQL query flow.
- Table data pagination through the existing PostgreSQL-style page service.
- SQL import through the existing PostgreSQL import service.
- Tests covering registration, defaults, service routing, connection config, and dialect SQL.

The first version does not include:

- Redshift Data API support.
- IAM database authentication or temporary credentials.
- AWS Secrets Manager integration.
- COPY, UNLOAD, Spectrum, or S3 import/export workflows.
- Redshift Workgroup/Cluster discovery through AWS APIs.
- Redshift privilege, workload management, or cluster administration panels.
- A live Redshift cluster integration test.

## Architecture

Redshift is a SQL backend. It should use the existing SQL tree, query workspace, import entry points, and table data page. It should not be modeled as NoSQL and should not add a new VS Code view.

The implementation will add `DatabaseType.REDSHIFT = "Redshift"`. `ConnectionManager` will route Redshift to a `RedshiftConnection`. `RedshiftConnection` can extend `PostgreSqlConnection`, but it must normalize missing Redshift defaults before creating the underlying `pg.Client`:

- `port`: `5439`
- `database`: `dev`
- `user`: `awsuser`
- `useSSL`: `true` unless explicitly disabled

No new runtime dependency is required. The existing `pg` driver is sufficient for the first version because Redshift accepts PostgreSQL wire-protocol clients for SQL sessions.

`ServiceManager.getDialect()` will return `RedshiftDialect`. `RedshiftDialect` should extend `PostgreSqlDialect` but override Redshift-sensitive SQL:

- `showDatabases()` should use `SELECT datname "Database" FROM pg_database WHERE datistemplate = false ORDER BY datname`.
- `showSchemas()` should use `information_schema.schemata`.
- `showTables(schema)` should use `information_schema.tables` for `BASE TABLE` rows.
- `showViews(schema)` should use `information_schema.views`.
- `showColumns(schema, table)` should use `information_schema.columns` and return the field names already consumed by the UI.
- `showTableSource(schema, table)` can return an empty string in phase one if Redshift cannot reliably reconstruct full table DDL through portable metadata.
- `tableTemplate()` should produce a Redshift-friendly table template with example `IDENTITY`, `DISTSTYLE`, and `SORTKEY` clauses instead of PostgreSQL `SERIAL`.
- `procedureTemplate()` and `functionTemplate()` should use Redshift PL/pgSQL-compatible syntax but keep templates conservative.

`ServiceManager.getPageService()` should reuse `PostgreSqlPageService` because Redshift supports `LIMIT`.

`ServiceManager.getImportService()` should reuse `PostgresqlImortService`. This keeps normal SQL script import behavior working through `psql` when available or the generic fallback otherwise. Redshift-specific bulk load is explicitly a later phase because COPY/UNLOAD needs S3/IAM parameters and a dedicated UI.

`ServiceManager.getDumpService()` can keep the generic `DumpService` path. Redshift DDL generation is not reliable enough to advertise as a dedicated export adapter in the first version.

## Connection UI

Add `Redshift` to `supportDatabases` near `PostgreSQL` and other SQL engines. Selecting Redshift should set:

- `dbType`: `Redshift`
- `host`: `127.0.0.1`
- `port`: `5439`
- `user`: `awsuser`
- `password`: empty string
- `database`: `dev`
- `useSSL`: `true`
- `connectTimeout`: `5000`
- `requestTimeout`: `10000`

The generic SQL connection form is enough for phase one. No Redshift-specific Vue component is required.

The logo should use an SVG at `resources/icon/redshift.svg`. If no existing local asset is present, create a simple Redshift-branded SVG icon in the same style as the current database logos.

Redshift should be included in the SSL certificate option list because it uses the PostgreSQL connection path and the existing `pg` SSL config already supports CA/client certificate/key fields.

## Tree Data Flow

Redshift connections stay under `CacheKey.DATBASE_CONECTIONS`.

`DbTreeDataProvider.getKeyByNode()` should treat Redshift as SQL and not include it in the NoSQL list. `DbTreeDataProvider.getNode()` can create the standard `ConnectionNode`, matching PostgreSQL and Kingbase behavior.

The SQL tree should model Redshift like PostgreSQL:

```text
Redshift connection
  database/catalog
    schema
      tables
      views
```

This matches the existing AirDB catalog/schema logic and lets `includeDatabases` filter Redshift databases before schema expansion. Table filter state and pinned-table state should use the same catalog/schema keying used by PostgreSQL and Kingbase.

## Error Handling

Connection failures should surface through the existing connection error UI. Redshift-specific failures are expected to mostly be PostgreSQL protocol errors from `pg`, so the first version should not introduce custom error translation.

If a Redshift metadata query fails because a cluster version or permission set does not expose a view, the query should fail visibly through the existing query/table error path. Metadata SQL should prefer `information_schema` views to reduce reliance on PostgreSQL-only internals.

## Testing

Add unit tests that do not require a running Redshift cluster:

- Redshift is present in connect UI configuration with default port `5439`, default database `dev`, default user `awsuser`, and SSL enabled.
- `DatabaseType.REDSHIFT` and tree routing keep Redshift in SQL registration paths.
- `ConnectionManager` creates `RedshiftConnection`.
- `RedshiftConnection` normalizes missing defaults before passing config to the PostgreSQL connection path.
- `ServiceManager.getDialect(DatabaseType.REDSHIFT)` returns `RedshiftDialect`.
- `ServiceManager.getPageService(DatabaseType.REDSHIFT)` returns PostgreSQL-style pagination.
- `ServiceManager.getImportService(DatabaseType.REDSHIFT)` returns the PostgreSQL import service.
- `RedshiftDialect` emits Redshift-safe SQL for schemas, tables, views, columns, and templates.

Run the focused Redshift tests, nearby PostgreSQL/Doris/multi-backend regression tests, and production build after implementation.

## Rollout

This should be implemented as normal feature commits. Version bump and Marketplace publish are separate release steps unless explicitly requested after implementation.
