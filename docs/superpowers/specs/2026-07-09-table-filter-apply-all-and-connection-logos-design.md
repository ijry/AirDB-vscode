# Table Filter Apply-All and Connection Logos Design

Date: 2026-07-09

## Scope

This change covers two focused updates:

1. The table result condition filter's "apply all" action should apply only checked conditions.
2. The new connection page should show database logos in the database type selector.

It does not change query execution, connection persistence, database drivers, or the table result layout beyond the condition filter behavior.

## Current Behavior

`ConditionFilter` emits `apply-row` with an index and `apply-all` without payload. The result page handles both with `applyConditionFilters`.

For a single row, `applyConditionFilters(rowIndex)` creates a temporary filter list where only the selected row remains enabled. For all rows, it currently passes the whole condition list to `buildTableFilterSql`. The SQL builder skips rows with `enabled === false`, but the caller does not make the "checked rows only" rule explicit.

The connection page currently renders database types as plain text tabs in `src/vue/connect/index.vue`. AirDB already has several database icons in `resources/icon`. The `otools-dbm` reference stores database type metadata, logo colors, and several SVG Vue icon components.

## Desired Behavior

### Table Condition Filters

Single-row apply remains unchanged: clicking a row's apply button applies only that row.

"Apply all" should build SQL from checked rows only. Unchecked rows remain visible in the UI and keep their values, but they are not part of the SQL generated for that action.

The SQL preview should stay consistent with execution behavior: disabled rows are ignored.

If no checked condition has a usable expression, the action should keep the existing no-op behavior and avoid re-running an unchanged base SQL.

### Connection Type Logos

The database type selector should remain compact and consistent with the current connection form. Each database type item should show a small logo or fallback badge plus the database name.

Use existing AirDB assets when available:

- MySQL
- PostgreSQL
- SqlServer
- SQLite
- MongoDB
- ElasticSearch
- SSH

For Oracle, Redis, and FTP, use the `otools-dbm` metadata as the visual reference. If a directly copyable standalone asset is not available, use a small colored text badge with the same style pattern and stable dimensions.

The selector should not become a large card grid. It should remain a tab-like control with clear active, hover, and keyboard-friendly visual states.

## Implementation Design

### Result Page

Update `src/vue/result/App.vue` in `applyConditionFilters`:

- Start from `this.toolbar.conditionFilters`.
- For single-row apply, keep the current temporary single-enabled-row mapping.
- For apply-all, pass only rows where `row.enabled !== false` into `buildTableFilterSql`.
- Keep the original toolbar filter list untouched so unchecked rows stay in the UI.

No change is required in `tableFilterSql.js` for correctness because it already ignores disabled rows, but a regression test should document the expected behavior.

### Connection Page

Update `src/vue/connect/index.vue`:

- Add a small database type metadata mapper for logo source, fallback text, background color, and text color.
- Render each tab item as icon/badge plus label.
- Keep `supportDatabases` values and the existing `connectionOption.dbType` watcher unchanged.
- Style icon containers with fixed width and height so hover and active states do not shift layout.

Logo lookup should be local to the component unless repeated elsewhere in the codebase. A broader shared abstraction is not needed for this change.

## Error Handling

For filters, invalid or empty rows continue to be ignored by `buildTableFilterSql`. If the generated SQL is empty or unchanged from the base SQL, no execution occurs.

For logos, missing optional image assets should fall back to a text badge. The connection page must still render all supported database types even if an image import is unavailable.

## Testing

Add or update tests for `test/tableFilterSql.test.js` to cover disabled rows being excluded from generated SQL.

Run:

- `node test/tableFilterSql.test.js`
- `npm run build`

Manual visual check:

- The connection page database type selector shows stable icon plus label items.
- Active and hover states remain readable in the VS Code webview theme.

## Acceptance Criteria

- "Apply all" includes only checked conditions in the generated SQL.
- Single-row apply still applies only that row.
- Unchecked filter rows remain editable and are not deleted.
- The connection page database type selector shows a logo or badge for every supported type.
- Existing connection defaults and database type switching behavior are unchanged.
