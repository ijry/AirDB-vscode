# Kingbase Official Node.js Driver Support Design

## Goal

Add KingbaseES support using Kingbase's official Nodejs driver package instead of the public npm `kb` package or the generic `pg` package. The first supported target is normal KingbaseES SQL usage in AirDB: create a connection, browse schemas/tables/views, open query pages, run SQL, and display result sets.

## Driver Source

Use Kingbase's official download page APIs as the source of the vendored driver:

- Download page: `https://www.kingbase.com.cn/download.html`
- Driver category API: `POST /cebest-cms/basic-content/type-center-all-list-parent-id`
- Interface driver API: `POST /cebest-cms/basic-content/interface driver-page-list`

The API lists `NODEJS` as interface driver category id `36`. The selected default package is the V9R1C10 allmode driver:

`https://kingbase.oss-cn-beijing.aliyuncs.com/upload/KESV9-baseline/allmode/V009R001C010/V009R001C010B0004_interface/NODEJS/KingbaseES_V009R001C010B0004_NODEJS.zip`

The OSS URL requires a Kingbase download-page referer. Automated fetches must send:

`Referer: https://www.kingbase.com.cn/download.html`

The downloaded package expands to `nodejs/node_modules`, including `kb` and its dependencies. The package is small, pure JavaScript, and contains no `.node`, `.dll`, `.so`, `.dylib`, or `.exe` files in the inspected V9R1C10 package.

## Licensing

The inspected package metadata has empty or missing `license` fields. The integration will keep a short provenance note next to the vendored files, including the official URL, version, retrieval date, and the lack of explicit license metadata.

This is acceptable for local/private integration. Before public marketplace release, the project owner should confirm that Kingbase permits redistributing the Nodejs driver inside a VS Code extension.

## Packaging Layout

Place the official driver under:

`resources/drivers/kingbase/node_modules/...`

This path is not excluded by the current `.vscodeignore`, while top-level `node_modules/` is excluded. The extension runtime will load the driver from the extension installation path, not through webpack static bundling.

Add:

`resources/drivers/kingbase/README.md`

The README records:

- KingbaseES driver line: V9R1C10 allmode.
- `kb` package version string from `package.json`.
- Official source URL.
- Fetch command or script.
- License metadata status.

## Runtime Loading

Add a small loader module, for example `src/service/connect/kingbaseDriverLoader.ts`, that resolves:

`Global.getExtPath("resources", "drivers", "kingbase", "node_modules", "kb")`

and loads it with runtime `require`. This keeps webpack from trying to resolve the vendored package at build time.

If loading fails, surface an actionable error:

`Kingbase official Nodejs driver is missing. Rebuild the extension with resources/drivers/kingbase/node_modules/kb.`

## Connection Model

Add `DatabaseType.KINGBASE = "KingbaseES"`.

Add `KingbaseConnection` with the same AirDB `IConnection` contract as `PostgreSqlConnection`:

- Construct `new Client({ host, port, user, password, database, ssl, connectionTimeoutMillis, statement_timeout })`.
- Default port is `54321`.
- `connect(callback)` calls `client.connect`.
- `query(sql, callback)` and `query(sql, values, callback)` call `client.query`.
- Stream-like event mode emits `result` rows and `end`, matching current PostgreSQL behavior.
- Transactions use `BEGIN`, `ROLLBACK`, and `COMMIT`.
- `isAlive()` mirrors the existing PostgreSQL checks where possible, falling back to connection flags exposed by `kb`.

Do not reuse the public npm `kb@0.0.5`; it is unrelated to Kingbase's official package.

## Dialect and Tree Behavior

First version uses PostgreSQL-style metadata because the official Nodejs examples use `Client.query` and `$1/$2` placeholders. Implement this conservatively as a `KingbaseDialect` that extends or delegates to `PostgreSqlDialect`, so future Kingbase-specific SQL can diverge without changing the connection type.

Use PostgreSQL-style catalog/schema tree behavior:

- Connections have catalog nodes.
- Catalog nodes contain schema nodes.
- Active database labels include database and schema.
- `KingbaseES` uses `PostgreSqlPageService` for `LIMIT/OFFSET` pagination initially.

If real KingbaseES tests show metadata differences, update only `KingbaseDialect`.

## Connection UI

Add `KingbaseES` to the database type selector:

- Label: `KingbaseES`
- Default port: `54321`
- Logo: use a text badge `KB` initially unless an existing Kingbase logo asset is available.
- SSL and SSH options follow PostgreSQL behavior.

The existing connection watchers/defaults must remain unchanged for other database types.

## Tests and Verification

Add focused unit tests for:

- Driver loader path/error behavior.
- `KingbaseConnection` result adaptation using a stubbed `Client`.
- `KingbaseDialect` delegates/returns expected schema/table/page SQL.

Run:

- `npm run build`
- Existing SQL/dialect tests

Manual verification with a live KingbaseES instance is still required before release:

- Connect with host/user/password/database/port.
- Browse catalog/schema/table/view.
- Run `SELECT 1`.
- Open table data view and paginate.
- Run parameterized insert/update if a scratch database is available.

## Risks

- Redistributing the official driver may need Kingbase approval because license metadata is missing.
- The selected V9R1C10 allmode package may not be ideal for every Kingbase compatibility branch. If users report version issues, add a documented driver update path or allow overriding the driver path.
- The package contains `lib/native` stubs requiring `kb-native`, but normal `require('kb').Client` uses the pure JS path. Avoid importing `kb/lib/native`.
