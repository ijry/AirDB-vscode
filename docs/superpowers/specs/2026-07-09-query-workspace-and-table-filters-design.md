# Query Workspace and Table Filters Design

## Goal

Improve the database browsing workflow by separating table data browsing from free-form SQL querying, and add a TablePlus-style condition filter panel to table result views.

## Scope

This change covers SQL database table browsing and SQL database query entry points:

- Table data pages opened from `airdb.table.find`.
- SQL connection, catalog, and schema query actions opened from `airdb.query.switch`.
- Existing SQL execution, pagination, export, edit, insert, delete, and design-table behavior where it already applies.

This change does not redesign saved query nodes, stored procedure/function/template editors, MongoDB collection pages, or Elasticsearch `.es` query documents.

## Current Behavior

Table data results and arbitrary SQL results share `src/vue/result/App.vue`. That page always shows a SQL textarea and table editing toolbar, even when the user only wants to browse table rows. Database query actions currently open a `.sql` text document through `QueryUnit.showSQLTextDocument`, so users leave the AirDB UI and must run SQL through editor commands.

## Proposed UX

### Table Data Page

The table data page should keep the result grid, editing tools, pagination, export, and table-structure actions, but replace the always-visible SQL textarea with a compact condition filter panel above the grid.

The filter panel contains rows with:

- Enabled checkbox.
- Field selector populated from result fields and table columns.
- Operator selector.
- Value input.
- Per-row apply button.
- Remove-row button.
- Add-row button.

It also supports a `Raw SQL` field option. A raw SQL row uses only the value input and inserts that value directly into the generated `WHERE` expression.

The panel includes:

- `全部应用` to apply all enabled rows.
- `清除过滤器` to remove all filter rows and return to the base table query.
- `SQL` button or popover to show the generated SQL, keeping the top area compact.

Rows are joined with `AND`. Disabled rows remain visible but are not included in generated SQL. Empty non-raw values are ignored. Empty raw SQL rows are ignored.

### SQL Query Workspace

The database query action opens a new webview instead of a `.sql` file. The page is a focused SQL workspace:

- SQL editor area at the top.
- Execute button and result status.
- Result grid below the editor.
- Error/message display.
- Pagination and export for result sets where supported.

The SQL query workspace does not show table-only controls: insert, delete, design table, or condition filter rows.

## Architecture

### Webview Pages

Keep the existing result page for table data, and add a dedicated query workspace webview entry.

- `src/vue/result/App.vue`: table data page with condition filter panel.
- `src/vue/result/component/ConditionFilter/index.vue`: condition filter component.
- `src/vue/queryWorkspace/main.js`: new Vue entry for SQL query workspace.
- `src/vue/queryWorkspace/App.vue`: SQL editor plus query result grid.
- `webpack.config.js`: add a `queryWorkspace` entry and `webview/queryWorkspace.html`.

The query workspace may reuse small presentational components from `src/vue/result/component` only when they are not table-edit specific. Shared code should stay small and explicit; avoid moving the entire existing result page into a shared abstraction in this change.

### Extension Host

Add a page opener for the SQL query workspace.

- `QueryWorkspacePage.open(connectionNode)` creates a webview panel with `path: 'queryWorkspace'`.
- Query workspace events call `QueryUnit.runQuery(sql, connectionNode, { viewId, split: false })`.
- `QueryPage.send` continues to deliver result data for executed SQL, but can route responses to the query workspace when `queryOption.viewMode === 'workspace'`.

Update query actions:

- `ConnectionNode.newQuery()` opens the query workspace and changes active database when the user selects a schema.
- `SchemaNode.newQuery()` opens the query workspace for that schema.
- `CatalogNode.newQuery()` opens the query workspace for that catalog.

### Table Filter SQL Generation

The table page tracks a stable base SQL for the current table result. The base SQL is the table select without conditions added by the condition filter panel.

When filters are applied:

1. Build enabled filter expressions.
2. Raw SQL rows contribute their value directly.
3. Non-raw rows become `wrappedColumn operator value`.
4. String-like values are quoted; `EMPTY` becomes `''`; `NULL` uses `IS NULL` or `IS NOT NULL` as appropriate.
5. Combine expressions with `AND`.
6. Insert or replace the generated `WHERE` block before pagination.
7. Execute the generated SQL through the existing webview `execute` event.

Supported operators:

- `=`
- `<>`
- `>`
- `>=`
- `<`
- `<=`
- `LIKE`
- `NOT LIKE`
- `IS NULL`
- `IS NOT NULL`

The generated SQL should use the existing database wrapper utilities for column names where possible.

## Data Flow

### Table Filters

1. User opens a table.
2. Extension runs the existing paged table SQL.
3. Table result page stores `baseTableSql` from the first table result.
4. User adds or edits filter rows.
5. Apply builds SQL from `baseTableSql` and filter rows.
6. Existing `execute` event runs the SQL.
7. Result data replaces the grid while keeping filter UI state.

### Query Workspace

1. User clicks the query action on a connection, catalog, or schema.
2. Extension opens `queryWorkspace.html` with connection context.
3. User writes SQL and clicks Execute or presses the supported shortcut.
4. Webview sends an execute event.
5. Extension runs `QueryUnit.runQuery`.
6. Result data, DML messages, or errors render in the query workspace.

## Error Handling

Table filter generation should not run a query when no enabled filter row produces an expression. In that case, clearing filters should execute the base table SQL.

Raw SQL validation is intentionally minimal. If a raw condition is invalid, the database error should be shown in the result message area.

If a query workspace is opened without a valid connection, show the existing "Not active database connection found" message and keep the workspace available for retry after connection selection.

## Keyboard Behavior

Table filter panel:

- `Enter` in a filter value applies that row.
- `Ctrl+Enter` applies all enabled filters.

Query workspace:

- `Ctrl+Enter` executes the SQL in the editor.

## Visual Design

Use a dense database-workbench style consistent with the existing VS Code theme:

- Dark-mode friendly controls using VS Code CSS variables.
- Compact rows and stable heights.
- No card nesting.
- Clear focus states for keyboard users.
- Buttons use existing Element UI icon buttons where available.

The filter panel should be compact enough to leave most vertical space for the data grid.

## Testing

Verification should include:

- `npm run build` passes.
- Opening a table still loads rows.
- Adding `field = value` filter reruns query and updates rows.
- Multiple enabled filters join with `AND`.
- Raw SQL filter reruns query.
- Clearing filters returns to the base table query without manual refresh.
- Database query action opens the query workspace instead of a `.sql` editor.
- Query workspace executes a `SELECT` and displays results.
- Query workspace shows DML success messages and SQL errors.

