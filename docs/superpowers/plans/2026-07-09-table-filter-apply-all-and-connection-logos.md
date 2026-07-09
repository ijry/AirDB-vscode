# Table Filter Apply-All and Connection Logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make table filter "apply all" use only checked conditions and show database logos in the connection type selector.

**Architecture:** Keep the existing result page and connection page structure. Extract the condition-row selection rule into `tableFilterSql.js` so it is directly testable, then call it from `App.vue`. Add a local logo metadata map in `src/vue/connect/index.vue` and render each existing database type tab as a compact logo-plus-label item.

**Tech Stack:** Vue 2 single-file components, Element UI, CommonJS utilities, Node assert tests, webpack asset loading.

## Global Constraints

- Do not change query execution, connection persistence, database drivers, or the table result layout beyond the condition filter behavior.
- Single-row apply remains unchanged: clicking a row's apply button applies only that row.
- "Apply all" should build SQL from checked rows only.
- Unchecked rows remain visible in the UI and keep their values.
- The database type selector should remain compact and consistent with the current connection form.
- Use existing AirDB assets when available; use `otools-dbm` metadata colors and text badge fallback for missing standalone assets.
- Existing connection defaults and database type switching behavior are unchanged.

---

## File Structure

- Modify `src/vue/result/util/tableFilterSql.js`: add and export `selectRowsForConditionApply(rows, rowIndex)`.
- Modify `test/tableFilterSql.test.js`: add assertions for all-row and single-row selection behavior and for generated SQL with mixed checked rows.
- Modify `src/vue/result/App.vue`: import and use `selectRowsForConditionApply` inside `applyConditionFilters`.
- Modify `src/vue/connect/index.vue`: add database logo metadata, render icon/badge tabs, add selection helper, and update scoped styles.

---

### Task 1: Testable Apply-All Row Selection

**Files:**
- Modify: `test/tableFilterSql.test.js`
- Modify: `src/vue/result/util/tableFilterSql.js`
- Modify: `src/vue/result/App.vue`

**Interfaces:**
- Consumes: `rows: Array<object>`, optional `rowIndex: number`.
- Produces: `selectRowsForConditionApply(rows, rowIndex): Array<object>`, exported from `src/vue/result/util/tableFilterSql.js`.
- Later code relies on `selectRowsForConditionApply` returning cloned rows, never mutating `toolbar.conditionFilters`.

- [ ] **Step 1: Add the failing row-selection tests**

In `test/tableFilterSql.test.js`, update the import block to include `selectRowsForConditionApply`:

```js
const {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
  buildConditionExpression,
  buildTableFilterSql,
  selectRowsForConditionApply,
} = require("../src/vue/result/util/tableFilterSql");
```

Append these assertions before `console.log("tableFilterSql tests passed");`:

```js
const mixedConditionRows = [
  { enabled: true, field: "uid", operator: "=", value: "2", type: "int" },
  { enabled: false, field: "name", operator: "=", value: "AirDB", type: "varchar" },
  { field: "status", operator: "=", value: "1", type: "int" },
];

assert.deepStrictEqual(
  selectRowsForConditionApply(mixedConditionRows),
  [
    { enabled: true, field: "uid", operator: "=", value: "2", type: "int" },
    { field: "status", operator: "=", value: "1", type: "int" },
  ]
);

assert.deepStrictEqual(
  selectRowsForConditionApply(mixedConditionRows, 1),
  [
    { enabled: false, field: "uid", operator: "=", value: "2", type: "int" },
    { enabled: false, field: "name", operator: "=", value: "AirDB", type: "varchar" },
    { enabled: false, field: "status", operator: "=", value: "1", type: "int" },
  ]
);

assert.deepStrictEqual(
  selectRowsForConditionApply(mixedConditionRows, 2),
  [
    { enabled: false, field: "uid", operator: "=", value: "2", type: "int" },
    { enabled: false, field: "name", operator: "=", value: "AirDB", type: "varchar" },
    { enabled: true, field: "status", operator: "=", value: "1", type: "int" },
  ]
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` LIMIT 100;",
    selectRowsForConditionApply(mixedConditionRows),
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` WHERE `uid` = 2 AND `status` = 1 LIMIT 100;"
);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
node test/tableFilterSql.test.js
```

Expected: FAIL with an error indicating `selectRowsForConditionApply` is not a function or is missing from the module export.

- [ ] **Step 3: Implement the selection helper**

In `src/vue/result/util/tableFilterSql.js`, add this function after `buildTableFilterSql`:

```js
function selectRowsForConditionApply(rows, rowIndex) {
  const sourceRows = Array.isArray(rows) ? rows : [];

  if (typeof rowIndex === "number") {
    return sourceRows.map((row, index) => ({
      ...row,
      enabled: index === rowIndex ? row.enabled !== false : false,
    }));
  }

  return sourceRows
    .filter((row) => row && row.enabled !== false)
    .map((row) => ({ ...row }));
}
```

Update the export block:

```js
module.exports = {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
  buildConditionExpression,
  buildTableFilterSql,
  selectRowsForConditionApply,
};
```

- [ ] **Step 4: Wire the helper into the result page**

In `src/vue/result/App.vue`, update the import:

```js
const {
  createDefaultFilterRow,
  buildTableFilterSql,
  selectRowsForConditionApply,
} = require("./util/tableFilterSql");
```

Replace the start of `applyConditionFilters(rowIndex)`:

```js
applyConditionFilters(rowIndex) {
  let rows = this.toolbar.conditionFilters || [];
  if (typeof rowIndex === "number") {
    rows = rows.map((row, index) => ({ ...row, enabled: index === rowIndex ? row.enabled !== false : false }));
  }

  const sql = buildTableFilterSql(
```

with:

```js
applyConditionFilters(rowIndex) {
  const rows = selectRowsForConditionApply(this.toolbar.conditionFilters, rowIndex);

  const sql = buildTableFilterSql(
```

- [ ] **Step 5: Run the focused test and confirm it passes**

Run:

```powershell
node test/tableFilterSql.test.js
```

Expected: PASS and prints `tableFilterSql tests passed`.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git add src/vue/result/util/tableFilterSql.js src/vue/result/App.vue test/tableFilterSql.test.js
git commit -m "fix: apply only checked table filters"
```

Expected: commit succeeds with only the three listed files.

---

### Task 2: Connection Type Logos

**Files:**
- Modify: `src/vue/connect/index.vue`

**Interfaces:**
- Consumes: existing `supportDatabases: string[]` and `connectionOption.dbType`.
- Produces: `getDbLogo(type): { icon?: string, text: string, bg: string, color: string }` and `selectDatabaseType(type): void` component methods.
- Does not change the `connectionOption.dbType` watcher or any connection defaults.

- [ ] **Step 1: Add database logo metadata**

In `src/vue/connect/index.vue`, after `vscodeEvent = getVscodeEvent();`, add:

```js
const fallbackDbLogo = {
  text: "DB",
  bg: "#f3f4f6",
  color: "#4b5563",
};

const dbLogoMap = {
  MySQL: {
    icon: require("@/../resources/icon/mysql.svg"),
    text: "My",
    bg: "#fef3e2",
    color: "#d97706",
  },
  PostgreSQL: {
    icon: require("@/../resources/icon/pg_server.svg"),
    text: "PG",
    bg: "#e8f0ff",
    color: "#2563eb",
  },
  Oracle: {
    text: "OR",
    bg: "#fff1f2",
    color: "#e11d48",
  },
  SqlServer: {
    icon: require("@/../resources/icon/mssql_server.png"),
    text: "MS",
    bg: "#eef2ff",
    color: "#4338ca",
  },
  SQLite: {
    icon: require("@/../resources/icon/sqlite-icon.svg"),
    text: "SQ",
    bg: "#e6f6ff",
    color: "#0ea5e9",
  },
  MongoDB: {
    icon: require("@/../resources/icon/mongodb-icon.svg"),
    text: "MG",
    bg: "#eafaf1",
    color: "#16a34a",
  },
  Redis: {
    text: "RD",
    bg: "#fef2f2",
    color: "#dc2626",
  },
  ElasticSearch: {
    icon: require("@/../resources/icon/elasticsearch.svg"),
    text: "ES",
    bg: "#ecfccb",
    color: "#65a30d",
  },
  SSH: {
    icon: require("@/../resources/icon/ssh.svg"),
    text: "SH",
    bg: "#f3f4f6",
    color: "#475569",
  },
  FTP: {
    text: "FTP",
    bg: "#eef2ff",
    color: "#4f46e5",
  },
};
```

- [ ] **Step 2: Render logo-plus-label tabs**

Replace the current database type `<li>` body:

```vue
<li
  class="tab__item"
  :class="{ 'tab__item--active': supportDatabase == connectionOption.dbType }"
  v-for="supportDatabase in supportDatabases"
  :key="supportDatabase"
  @click="connectionOption.dbType = supportDatabase"
>
  {{ supportDatabase }}
</li>
```

with:

```vue
<li
  class="tab__item"
  :class="{ 'tab__item--active': supportDatabase == connectionOption.dbType }"
  v-for="supportDatabase in supportDatabases"
  :key="supportDatabase"
  role="button"
  tabindex="0"
  @click="selectDatabaseType(supportDatabase)"
  @keydown.enter.prevent="selectDatabaseType(supportDatabase)"
  @keydown.space.prevent="selectDatabaseType(supportDatabase)"
>
  <span
    class="tab__logo"
    :style="{ background: getDbLogo(supportDatabase).bg, color: getDbLogo(supportDatabase).color }"
    aria-hidden="true"
  >
    <img
      v-if="getDbLogo(supportDatabase).icon"
      class="tab__logo-image"
      :src="getDbLogo(supportDatabase).icon"
      alt=""
    />
    <span v-else class="tab__logo-text">{{ getDbLogo(supportDatabase).text }}</span>
  </span>
  <span class="tab__label">{{ supportDatabase }}</span>
</li>
```

- [ ] **Step 3: Add methods for logo lookup and type selection**

In the `methods` block of `src/vue/connect/index.vue`, add these methods before `userSuccess(userState)`:

```js
getDbLogo(type) {
  return dbLogoMap[type] || fallbackDbLogo;
},
selectDatabaseType(type) {
  this.connectionOption.dbType = type;
},
```

- [ ] **Step 4: Update tab styles**

In the scoped style block, replace the `.tab`, `.tab__item`, `.tab__item:hover`, and `.tab__item--active` rules with:

```css
.tab {
  border-bottom: 1px solid var(--vscode-dropdown-border);
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 0;
}

.tab__item {
  list-style: none;
  cursor: pointer;
  font-size: 13px;
  min-height: 34px;
  padding: 6px 10px;
  color: var(--vscode-foreground);
  border: 1px solid transparent;
  border-bottom-color: transparent;
  border-radius: 4px 4px 0 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  outline: none;
  transition: color 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.tab__item:hover,
.tab__item:focus {
  color: var(--vscode-panelTitle-activeForeground);
  border-color: var(--vscode-dropdown-border);
  background: var(--vscode-list-hoverBackground);
}

.tab__item--active {
  color: var(--vscode-panelTitle-activeForeground);
  border-color: var(--vscode-dropdown-border);
  border-bottom-color: var(--vscode-panelTitle-activeForeground);
  background: var(--vscode-editor-background);
}
```

Add these rules after `.tab__item--active`:

```css
.tab__logo {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 22px;
  overflow: hidden;
}

.tab__logo-image {
  max-width: 16px;
  max-height: 16px;
  display: block;
  object-fit: contain;
}

.tab__logo-text {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.tab__label {
  line-height: 1;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run the build**

Run:

```powershell
npm run build
```

Expected: build succeeds. If webpack reports an asset path error, correct only the failing `require("@/../resources/icon/...")` path and rerun the build.

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
git add src/vue/connect/index.vue
git commit -m "feat: show database logos in connection form"
```

Expected: commit succeeds with only `src/vue/connect/index.vue`.

---

### Task 3: Final Verification

**Files:**
- Read: `git status --short`
- Read: latest test/build output

**Interfaces:**
- Consumes: committed changes from Task 1 and Task 2.
- Produces: a clean final state with verification results ready to report.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node test/tableFilterSql.test.js
```

Expected: PASS and prints `tableFilterSql tests passed`.

- [ ] **Step 2: Run production build**

Run:

```powershell
npm run build
```

Expected: build succeeds without Vue template or asset loader errors.

- [ ] **Step 3: Inspect git history and working tree**

Run:

```powershell
git log --oneline -3
git status --short
```

Expected: latest commits include:

```text
feat: show database logos in connection form
fix: apply only checked table filters
docs: design filter apply all and connection logos
```

Expected: `git status --short` is empty.

- [ ] **Step 4: Report outcome**

Report these items:

```text
Implemented:
- Apply-all table filters now use only checked conditions.
- Connection database type selector now shows compact logos or fallback badges.

Verified:
- node test/tableFilterSql.test.js
- npm run build

Commits:
- fix: apply only checked table filters
- feat: show database logos in connection form
```
