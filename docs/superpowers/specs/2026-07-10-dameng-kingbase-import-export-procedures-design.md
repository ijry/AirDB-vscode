# Dameng And Kingbase Import Export Procedures Design

## Goal

Add first-class Dameng support with the official `dmdb` npm package, and bring KingbaseES up to the same practical feature level for SQL work: connection, query, metadata tree, pagination, import, export, and complex routine scripts.

## Scope

This work covers two database families:

- KingbaseES: keep the already integrated official Nodejs driver and extend the feature surface beyond basic connection/query.
- Dameng: add a new `DatabaseType.DAMENG = "Dameng"` using the official `dmdb` npm package, not OCI, not Instant Client, and not a vendored driver directory.

The first complete release must support:

- Connection create/edit/test/open.
- SSH tunnel reuse through the existing `ConnectionManager`.
- Schema, table, view, column, procedure, function, and trigger tree nodes.
- Query execution and result grid display.
- Table pagination and count queries.
- SQL import from files with stored procedure/function/trigger bodies that contain semicolons.
- SQL export for schema, data, views, procedures, functions, and triggers.
- Routine source display from tree nodes.
- Procedure/function/trigger templates suitable for each database.

## Non-Goals

This pass does not add a visual stored procedure debugger, profiler, package editor, database-specific backup binary bundling, or automated live integration tests against real KingbaseES/Dameng servers. This release path uses the Node drivers alone and does not call local CLI tools such as `ksql`, `psql`, `dexp`, or `dimp`.

## References

- Dameng Node.js guide: `https://eco.dameng.com/document/dm/zh-cn/pm/nodejs-rogramming-guide.html`
- Dameng npm package selected by user: `dmdb@1.0.49630`
- Kingbase official Nodejs driver already integrated under `resources/drivers/kingbase/node_modules/kb`
- Existing Kingbase design: `docs/superpowers/specs/2026-07-09-kingbase-official-nodejs-driver-design.md`

## Architecture

Dameng uses the same extension seams as Oracle and Kingbase:

- `DatabaseType`
- `ConnectionManager`
- `ServiceManager`
- `SqlDialect`
- `PageService`
- connection page database selector and defaults
- tree node metadata SQL
- import and dump services

Kingbase remains PostgreSQL-compatible for query execution and most metadata, but gets dedicated import/dump/routine handling instead of relying on the generic fallback.

Dameng is closer to Oracle in object semantics. Its connection wrapper will normalize `dmdb.execute()` results into AirDB's existing `queryCallback` shape. Its dialect should expose schema-level tree semantics and use Dameng-compatible dictionary queries for metadata and source retrieval.

## Components

### Dameng Driver And Connection

Add `dmdb` as a regular dependency in `package.json`, pinned to the selected version.

Create `src/service/connect/damengConnection.ts`:

- Use `dmdb.getConnection({ host, port, user, password })`.
- Default port: `5236`.
- Default user in UI: `SYSDBA`.
- Treat `node.database`/`node.schema` as the active schema when switching tree nodes.
- Map `node.connectTimeout` and `node.requestTimeout` only through documented or observed `dmdb` options. If the driver does not expose a compatible option, leave timeout enforcement to the caller and document that limitation in the connection wrapper test.
- Support callback mode and event mode like existing connections.
- Avoid unhandled `"error"` events in callback mode, matching the Kingbase fix.
- Implement transactions with `beginTransaction`, `commit`, and `rollback`.
- Close with `connection.close()`.

Create `src/service/connect/damengResultAdapter.ts`:

- Convert select results with `rows` and `metaData` into `{ results: rows, fields }`.
- Convert DML results with `rowsAffected` into `{ affectedRows }`.
- Build AirDB `FieldInfo` objects using metadata column names.

### Dameng Dialect And Page Service

Create `src/service/dialect/damengDialect.ts`:

- `showSchemas()`: list visible schemas/users and exclude core system schemas by default.
- `showTables(schema)`: return `"name"` and `"comment"` columns.
- `showViews(schema)`: return `"name"`.
- `showColumns(schema, table)`: return `"name"`, `"simpleType"`, `"type"`, `"nullable"`, `"maxLength"`, `"defaultValue"`, `"comment"`, and `"key"`.
- `showProcedures(schema)`, `showFunctions(schema)`, and `showTriggers(schema)`: return `ROUTINE_NAME` or `TRIGGER_NAME` column names expected by existing tree groups.
- `showProcedureSource`, `showFunctionSource`, and `showTriggerSource`: return existing compatible columns: `"Create Procedure"`, `"Create Function"`, and `"SQL Original Statement"`.
- Source retrieval order is deterministic: try `DBMS_METADATA.GET_DDL` first; if the server rejects it, query source dictionary rows and concatenate them by line/order in SQL.
- `pingDataBase(schema)`: switch current schema or no-op with a light `SELECT 1`.
- `buildPageSql` and `countSql`: schema-qualified SQL.
- Templates use Dameng PL/SQL-style blocks with `/` as the final routine terminator in script form.

Create `src/service/page/damengPageService.ts`:

- Use `OFFSET <start> ROWS FETCH NEXT <limit> ROWS ONLY`, matching Dameng's Oracle-compatible pagination surface.
- Replace existing pagination if present to support table-result next page.

### Kingbase Routine Dialect Improvements

Extend `src/service/dialect/kingbaseDialect.ts` beyond the current PostgreSQL subclass where needed:

- Procedures: query `pg_proc` with `prokind = 'p'` and `pg_namespace`.
- Functions: query `pg_proc` with function-compatible `prokind`.
- Routine source: use `pg_get_functiondef(oid)` by joining on namespace and routine name instead of relying on `regproc` name resolution. This avoids failures when schemas or overloads make simple names ambiguous.
- Triggers: use `pg_get_triggerdef(oid)` and include relation context for drop statements.
- Templates use dollar-quoted bodies so complex procedure/function scripts can contain semicolons.

The existing `KingbaseDialect extends PostgreSqlDialect` can remain, but it should override only the methods where Kingbase needs stable behavior or where PostgreSQL's generic implementation is too weak.

### Import Services

Create database-specific import services:

- `src/service/import/kingbaseImportService.ts`
- `src/service/import/damengImportService.ts`

Both services should execute through AirDB connections and must not require external CLIs. External tool acceleration is outside this design.

Add a reusable script parser, for example `src/service/import/sqlScriptBatchParser.ts`:

- Preserve semicolons inside single quotes, double quotes, line comments, block comments, dollar-quoted strings, and PL/SQL-style routine blocks.
- Kingbase mode recognizes PostgreSQL dollar quotes such as `$$` and `$body$`.
- Dameng mode recognizes `/` on its own line as a routine terminator for `CREATE OR REPLACE PROCEDURE`, `CREATE OR REPLACE FUNCTION`, and `CREATE OR REPLACE TRIGGER`.
- Existing MySQL `DELIMITER` support remains available for MySQL.
- Parser returns executable statement batches without stripping routine body semicolons.

`ServiceManager.getImportService` should return:

- `KingbaseImportService` for `DatabaseType.KINGBASE`.
- `DamengImportService` for `DatabaseType.DAMENG`.

### Export Services

Add database-specific dump services:

- `src/service/dump/kingbaseDumpService.ts`
- `src/service/dump/damengDumpService.ts`

Both should reuse the existing picker UX from `DumpService` but use database profiles for SQL generation.

Create a small shared profile layer, for example:

- `src/service/dump/sqlScriptDumpProfile.ts`
- `src/service/dump/sqlScriptDumpService.ts`

The profile should define:

- Identifier quoting.
- Schema-qualified names.
- Drop statements.
- Insert value escaping.
- Multi-row insert support.
- Routine terminator style.
- Whether to include `CREATE SCHEMA` or `CREATE USER`.

Kingbase export:

- Use double-quoted identifiers where necessary.
- Use PostgreSQL/Kingbase-compatible `DROP ... IF EXISTS`.
- Dump data as `INSERT INTO schema.table (...) VALUES (...);`.
- Dump functions/procedures/triggers with dollar-quoted source returned by the dialect.

Dameng export:

- Use double-quoted identifiers where necessary.
- Dump table/view source with Dameng-compatible DDL from dialect source methods.
- Dump routines with `/` after the `CREATE OR REPLACE ... END;` block so import can execute complex bodies safely.
- Dump data as standard `INSERT` statements with correctly escaped strings, dates, nulls, and binary-safe fallbacks.

`ServiceManager.getDumpService` should return:

- `MysqlDumpService` for MySQL.
- `KingbaseDumpService` for KingbaseES.
- `DamengDumpService` for Dameng.
- Existing generic `DumpService` for the rest.

### Tree And UI

Add Dameng to the connection form:

- Database selector item: `"Dameng"`.
- Logo badge: `DM`, using the same small badge style as other databases unless a stable logo asset is already available.
- Defaults: user `SYSDBA`, port `5236`, database/schema default `SYSDBA`, SSL disabled.
- Use the existing `database` input as schema name, similar to Oracle's schema-oriented tree.

Tree behavior:

- Dameng should behave like Oracle for schema-level browsing: connection -> schema -> table/view/routine groups.
- Kingbase remains PostgreSQL-like: catalog/schema handling stays, but routine groups must work reliably under selected schema.
- Active schema switching must work for Dameng and Kingbase.

### Routine Source Display

The current nodes expect source columns named `"Create Procedure"`, `"Create Function"`, and `"SQL Original Statement"`. New dialect source SQL must return those columns for compatibility.

Also improve the nodes defensively:

- If a dialect returns normalized `CREATE_SQL`, use it as a fallback.
- If a routine source is missing, show a clear error instead of opening an empty editor.
- When showing complex routines, keep original body delimiters intact.

### Error Handling

- Missing `dmdb` should fail with a clear message explaining that dependencies need to be installed/built.
- Driver query errors must call callbacks without emitting unhandled `error` events when no listener is attached.
- Import should stop on the first failed statement, roll back where the connection supports transactions, and report the failing statement index.
- Export should skip only objects that fail to dump when the existing UX expects partial export, but log the object name and error through `Console`.
- Connection cleanup must close import/export session connections.

### Testing

Add focused unit tests for:

- Dameng result adapter.
- Dameng connection wrapper with a fake `dmdb` module.
- Dameng dialect metadata SQL and source column aliases.
- Dameng page service.
- Dameng service registration and connection UI defaults.
- Kingbase routine dialect overrides.
- Kingbase import script parser with dollar-quoted procedure bodies.
- Dameng import script parser with slash-terminated procedure bodies.
- Dump profile SQL generation for Kingbase and Dameng.
- Regression tests for existing Kingbase basic connection behavior and existing Oracle result adapter.

Build verification:

- `npm run build`
- existing Kingbase tests
- new Dameng tests
- existing Oracle/table-filter regressions

Manual verification before release:

1. KingbaseES: create connection, expand catalog/schema, list tables/views/procedures/functions/triggers.
2. KingbaseES: show routine source with a body containing semicolons.
3. KingbaseES: import a SQL file containing a dollar-quoted procedure/function.
4. KingbaseES: export schema-only and schema-with-data SQL, then re-import into a clean schema.
5. Dameng: create connection with host/user/password/port 5236.
6. Dameng: expand schema and list tables/views/procedures/functions/triggers.
7. Dameng: run `SELECT 1`.
8. Dameng: table pagination.
9. Dameng: import a slash-terminated procedure script.
10. Dameng: export schema-only and schema-with-data SQL, then re-import into a clean schema.
11. Both: SSH tunnel connection path.

## Risks

- Dameng dictionary/source SQL can vary by server compatibility mode. The implementation should keep source retrieval isolated in `DamengDialect` so live-server fixes do not affect generic import/export code.
- Kingbase routine overloads need OID-based source lookup. The tree label alone may be insufficient to drop overloaded functions safely; source display and export should still work.
- Public redistribution rights remain a separate concern for vendored Kingbase driver files.
- SQL script parsing is inherently delicate. The parser should be covered by tests for quotes, comments, dollar quotes, and slash-terminated routines before it is used by import services.
