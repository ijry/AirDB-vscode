# Query Workspace and Table Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated SQL query workspace and add a TablePlus-style condition filter panel to table result views.

**Architecture:** Keep `src/vue/result/App.vue` as the table data view, add a focused `ConditionFilter` child component, and isolate SQL condition generation in a CommonJS utility with Node tests. Add a new `queryWorkspace` Vue webview entry and route database query actions there instead of opening `.sql` files, while preserving existing `QueryUnit.runQuery` execution behavior.

**Tech Stack:** VS Code extension API, TypeScript extension host, Vue 2, Element UI, umy-table, webpack 4, Node assert tests.

## Global Constraints

- Table data pages opened from `airdb.table.find` get the condition filter panel.
- SQL connection, catalog, and schema query actions opened from `airdb.query.switch` open the new query workspace.
- Saved query nodes, stored procedure/function/template editors, MongoDB collection pages, and Elasticsearch `.es` query documents are out of scope.
- Table filter rows are joined with `AND`.
- Raw SQL rows insert their value directly into the generated `WHERE` expression.
- Query workspace must not show table-only controls: insert, delete, design table, or condition filter rows.
- Use existing VS Code CSS variables and Element UI controls.
- `npm run build` must pass before completion.

---

## File Structure

- Create `src/vue/result/util/tableFilterSql.js`: pure condition-row SQL generation helpers, exported with `module.exports` so Node tests can require them.
- Create `test/tableFilterSql.test.js`: Node assert coverage for filter SQL generation.
- Create `src/vue/result/component/ConditionFilter/index.vue`: table filter panel UI and events.
- Modify `src/vue/result/App.vue`: replace the always-visible table SQL textarea with `ConditionFilter` for table views, preserve existing grid/edit/export/pagination behavior, and keep SQL textarea behavior only for non-table result usage while query workspace migration is in progress.
- Create `src/vue/queryWorkspace/main.js`: Vue entry for the dedicated SQL query workspace.
- Create `src/vue/queryWorkspace/App.vue`: SQL editor, execute action, status, and read-only result grid.
- Create `src/service/result/queryWorkspace.ts`: extension-host webview opener and event bridge.
- Modify `src/service/result/query.ts`: route query responses to query workspace when `queryOption.viewMode === 'workspace'`.
- Modify `src/service/queryUnit.ts`: add `viewMode?: 'result' | 'workspace'` to `QueryOption`.
- Modify `src/model/database/connectionNode.ts`, `src/model/database/schemaNode.ts`, and `src/model/database/catalogNode.ts`: call the query workspace opener from `newQuery()`.
- Modify `webpack.config.js`: add `queryWorkspace` entry and `webview/queryWorkspace.html`.

---

### Task 1: Add Table Filter SQL Utility

**Files:**
- Create: `src/vue/result/util/tableFilterSql.js`
- Create: `test/tableFilterSql.test.js`

**Interfaces:**
- Produces:
  - `RAW_SQL_FIELD: "__raw_sql__"`
  - `createDefaultFilterRow(fields?: Array<{ name: string }>): FilterRow`
  - `buildConditionExpression(row, dbType, wrapColumn, quoteValue): string`
  - `buildTableFilterSql(baseSql, rows, dbType, wrapColumn, quoteValue): string`
- Consumes:
  - `wrapColumn(name: string, dbType: string): string`
  - `quoteValue(columnType: string | undefined, value: string): string`

- [ ] **Step 1: Create the failing Node test**

Create `test/tableFilterSql.test.js`:

```js
const assert = require("assert");
const {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
  buildConditionExpression,
  buildTableFilterSql,
} = require("../src/vue/result/util/tableFilterSql");

const wrapColumn = (name) => `\`${name}\``;
const quoteValue = (type, value) => {
  if (value === "EMPTY") return "''";
  if (value === "NULL") return "null";
  if (["int", "bigint", "decimal"].includes(type)) return value;
  return `'${String(value).replace(/'/g, "\\'")}'`;
};

assert.deepStrictEqual(createDefaultFilterRow([{ name: "uid" }]), {
  enabled: true,
  field: "uid",
  operator: "=",
  value: "",
});

assert.strictEqual(
  buildConditionExpression(
    { enabled: true, field: "uid", operator: "=", value: "2", type: "int" },
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "`uid` = 2"
);

assert.strictEqual(
  buildConditionExpression(
    { enabled: true, field: "name", operator: "LIKE", value: "%air%", type: "varchar" },
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "`name` LIKE '%air%'"
);

assert.strictEqual(
  buildConditionExpression(
    { enabled: true, field: "name", operator: "IS NULL", value: "ignored", type: "varchar" },
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "`name` IS NULL"
);

assert.strictEqual(
  buildConditionExpression(
    { enabled: true, field: RAW_SQL_FIELD, operator: "=", value: "uid is not null" },
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "(uid is not null)"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` LIMIT 100;",
    [
      { enabled: true, field: "uid", operator: "=", value: "2", type: "int" },
      { enabled: true, field: RAW_SQL_FIELD, operator: "=", value: "status = 1" },
    ],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` WHERE `uid` = 2 AND (status = 1) LIMIT 100;"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` WHERE `uid` = 1 LIMIT 100;",
    [{ enabled: true, field: "name", operator: "=", value: "AirDB", type: "varchar" }],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` WHERE `name` = 'AirDB' LIMIT 100;"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` LIMIT 100;",
    [{ enabled: false, field: "uid", operator: "=", value: "2", type: "int" }],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` LIMIT 100;"
);

console.log("tableFilterSql tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node test/tableFilterSql.test.js
```

Expected: FAIL with `Cannot find module '../src/vue/result/util/tableFilterSql'`.

- [ ] **Step 3: Add the SQL helper implementation**

Create `src/vue/result/util/tableFilterSql.js`:

```js
const RAW_SQL_FIELD = "__raw_sql__";

const PAGE_PATTERN = /\s+(LIMIT\s+\d+(?:\s*,\s*\d+)?(?:\s+OFFSET\s+\d+)?|OFFSET\s+\d+\s+ROWS\s+FETCH\s+NEXT\s+\d+\s+ROWS\s+ONLY)\s*;?\s*$/i;

function normalizeSql(sql) {
  return String(sql || "").trim().replace(/;+\s*$/, "");
}

function splitPaging(sql) {
  const normalized = normalizeSql(sql);
  const match = normalized.match(PAGE_PATTERN);
  if (!match) {
    return { body: normalized, paging: "" };
  }
  return {
    body: normalized.slice(0, match.index).trim(),
    paging: match[1].trim(),
  };
}

function stripExistingWhere(sql) {
  return sql.replace(/\s+\bwhere\b\s+.+$/i, "").trim();
}

function createDefaultFilterRow(fields) {
  const firstField = Array.isArray(fields) && fields.length > 0 ? fields[0].name : RAW_SQL_FIELD;
  return {
    enabled: true,
    field: firstField || RAW_SQL_FIELD,
    operator: "=",
    value: "",
  };
}

function isEmptyValue(row) {
  return row.value === undefined || row.value === null || String(row.value).trim() === "";
}

function buildConditionExpression(row, dbType, wrapColumn, quoteValue) {
  if (!row || row.enabled === false) {
    return "";
  }

  const field = row.field;
  const operator = row.operator || "=";

  if (field === RAW_SQL_FIELD) {
    if (isEmptyValue(row)) {
      return "";
    }
    return `(${String(row.value).trim()})`;
  }

  if (!field) {
    return "";
  }

  const column = wrapColumn(field, dbType);
  if (operator === "IS NULL" || operator === "IS NOT NULL") {
    return `${column} ${operator}`;
  }

  if (isEmptyValue(row)) {
    return "";
  }

  const valueText = String(row.value).trim();
  const quoted = valueText.toUpperCase() === "NULL"
    ? "null"
    : quoteValue(row.type, row.value);

  return `${column} ${operator} ${quoted}`;
}

function buildTableFilterSql(baseSql, rows, dbType, wrapColumn, quoteValue) {
  const expressions = (rows || [])
    .map((row) => buildConditionExpression(row, dbType, wrapColumn, quoteValue))
    .filter((expression) => expression);

  if (expressions.length === 0) {
    return `${normalizeSql(baseSql)};`;
  }

  const parts = splitPaging(baseSql);
  const baseBody = stripExistingWhere(parts.body);
  const paging = parts.paging ? ` ${parts.paging}` : "";
  return `${baseBody} WHERE ${expressions.join(" AND ")}${paging};`;
}

module.exports = {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
  buildConditionExpression,
  buildTableFilterSql,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node test/tableFilterSql.test.js
```

Expected: PASS and prints `tableFilterSql tests passed`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/vue/result/util/tableFilterSql.js test/tableFilterSql.test.js
git commit -m "test: add table filter sql builder"
```

---

### Task 2: Build the Condition Filter Component

**Files:**
- Create: `src/vue/result/component/ConditionFilter/index.vue`

**Interfaces:**
- Consumes from Task 1:
  - `RAW_SQL_FIELD`
  - `createDefaultFilterRow(fields)`
- Props:
  - `fields: Array`
  - `columnList: Array`
  - `filters: Array`
  - `generatedSql: string`
- Emits:
  - `update:filters`
  - `apply-row(index: number)`
  - `apply-all`
  - `clear`

- [ ] **Step 1: Create the component**

Create `src/vue/result/component/ConditionFilter/index.vue`:

```vue
<template>
  <div class="condition-filter">
    <div
      v-for="(row, index) in localFilters"
      :key="row.id || index"
      class="condition-filter__row"
      :class="{ 'condition-filter__row--disabled': !row.enabled }"
    >
      <el-checkbox v-model="row.enabled" @change="emitFilters"></el-checkbox>

      <el-select
        v-model="row.field"
        size="mini"
        class="condition-filter__field"
        @change="onFieldChange(row)"
      >
        <el-option
          v-for="field in fieldOptions"
          :key="field.value"
          :label="field.label"
          :value="field.value"
        ></el-option>
      </el-select>

      <el-select
        v-if="row.field !== RAW_SQL_FIELD"
        v-model="row.operator"
        size="mini"
        class="condition-filter__operator"
        @change="emitFilters"
      >
        <el-option
          v-for="operator in operators"
          :key="operator"
          :label="operator"
          :value="operator"
        ></el-option>
      </el-select>

      <el-input
        v-model="row.value"
        size="mini"
        class="condition-filter__value"
        :placeholder="row.field === RAW_SQL_FIELD ? 'Raw SQL' : 'EMPTY'"
        @input="emitFilters"
        @keyup.enter.native="applyRow(index)"
        @keyup.ctrl.enter.native="applyAll"
      ></el-input>

      <el-button size="mini" @click="applyRow(index)">应用</el-button>
      <el-button size="mini" icon="el-icon-minus" @click="removeRow(index)"></el-button>
      <el-button size="mini" icon="el-icon-plus" @click="addRow(index + 1)"></el-button>
    </div>

    <div class="condition-filter__footer">
      <el-button size="mini" icon="el-icon-s-operation" @click="addRow(localFilters.length)"></el-button>
      <el-button size="mini" @click="$emit('clear')">清除过滤器</el-button>
      <el-popover placement="bottom-start" width="520" trigger="click">
        <pre class="condition-filter__sql">{{ generatedSql }}</pre>
        <el-button slot="reference" size="mini">SQL</el-button>
      </el-popover>
      <span class="condition-filter__hint">显示: Ctrl F 隐藏: ESC 插入: Ctrl I 删除: Ctrl Shift I 向上: Ctrl ↑ 向下: Ctrl ↓ 应用: Enter 应用全部: Ctrl Enter</span>
      <el-button size="mini" type="primary" @click="applyAll">全部应用</el-button>
    </div>
  </div>
</template>

<script>
const {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
} = require("../../util/tableFilterSql");

export default {
  props: {
    fields: { type: Array, default: () => [] },
    columnList: { type: Array, default: () => [] },
    filters: { type: Array, default: () => [] },
    generatedSql: { type: String, default: "" },
  },
  data() {
    return {
      RAW_SQL_FIELD,
      operators: ["=", "<>", ">", ">=", "<", "<=", "LIKE", "NOT LIKE", "IS NULL", "IS NOT NULL"],
      localFilters: [],
    };
  },
  computed: {
    fieldOptions() {
      const seen = {};
      const fields = (this.fields || [])
        .filter((field) => field && field.name && !seen[field.name] && (seen[field.name] = true))
        .map((field) => ({ label: field.name, value: field.name }));

      return [{ label: "Raw SQL", value: RAW_SQL_FIELD }, ...fields];
    },
  },
  watch: {
    filters: {
      immediate: true,
      deep: true,
      handler(value) {
        this.localFilters = (value || []).map((row, index) => ({
          id: row.id || `${Date.now()}-${index}`,
          enabled: row.enabled !== false,
          field: row.field || RAW_SQL_FIELD,
          operator: row.operator || "=",
          value: row.value || "",
          type: row.type,
        }));
      },
    },
  },
  methods: {
    makeRow() {
      return {
        id: `${Date.now()}-${Math.random()}`,
        ...createDefaultFilterRow(this.fields),
      };
    },
    emitFilters() {
      this.$emit("update:filters", this.localFilters.map((row) => ({ ...row })));
    },
    addRow(index) {
      this.localFilters.splice(index, 0, this.makeRow());
      this.emitFilters();
    },
    removeRow(index) {
      this.localFilters.splice(index, 1);
      if (this.localFilters.length === 0) {
        this.localFilters.push(this.makeRow());
      }
      this.emitFilters();
    },
    onFieldChange(row) {
      const column = (this.columnList || []).find((item) => item.name === row.field);
      row.type = column ? (column.simpleType || column.type) : undefined;
      if (row.field === RAW_SQL_FIELD) {
        row.operator = "=";
      }
      this.emitFilters();
    },
    applyRow(index) {
      this.emitFilters();
      this.$emit("apply-row", index);
    },
    applyAll() {
      this.emitFilters();
      this.$emit("apply-all");
    },
  },
};
</script>

<style scoped>
.condition-filter {
  border-bottom: 1px solid var(--vscode-textBlockQuote-background);
  padding: 4px 0;
}

.condition-filter__row {
  display: grid;
  grid-template-columns: 24px 120px 100px minmax(160px, 1fr) 58px 32px 32px;
  gap: 6px;
  align-items: center;
  margin-bottom: 4px;
}

.condition-filter__row--disabled {
  opacity: 0.55;
}

.condition-filter__operator {
  width: 100px;
}

.condition-filter__field {
  width: 120px;
}

.condition-filter__value {
  min-width: 160px;
}

.condition-filter__footer {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}

.condition-filter__hint {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.condition-filter__sql {
  margin: 0;
  white-space: pre-wrap;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}
</style>
```

- [ ] **Step 2: Run the existing helper test**

Run:

```powershell
node test/tableFilterSql.test.js
```

Expected: PASS and prints `tableFilterSql tests passed`.

- [ ] **Step 3: Build to catch Vue syntax errors**

Run:

```powershell
npm run build
```

Expected: PASS. Existing webpack warnings about MongoDB dynamic requires, `supports-color`, and bundle size may remain.

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/vue/result/component/ConditionFilter/index.vue
git commit -m "feat: add table condition filter component"
```

---

### Task 3: Integrate Condition Filters into the Table Result Page

**Files:**
- Modify: `src/vue/result/App.vue`

**Interfaces:**
- Consumes from Task 1:
  - `buildTableFilterSql(baseSql, rows, dbType, wrapColumn, quoteValue)`
- Consumes from Task 2:
  - `<ConditionFilter :filters.sync="toolbar.conditionFilters" ... />`
- Produces:
  - `isTableResult` computed property.
  - `baseTableSql` state.
  - `applyConditionFilters(rowIndex?: number)` method.
  - `clearConditionFilters()` method.

- [ ] **Step 1: Update imports**

In `src/vue/result/App.vue`, add:

```js
import ConditionFilter from "./component/ConditionFilter";
const {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
  buildTableFilterSql,
} = require("./util/tableFilterSql");
```

Add `ConditionFilter` to `components`.

- [ ] **Step 2: Extend component state**

In `data()`, add these fields:

```js
baseTableSql: "",
toolbar: {
  sql: null,
  filter: {},
  showColumns: [],
  conditionFilters: [],
},
```

Keep the existing `toolbar.filter` because the inline grid filter row still references it until the template is removed from table mode.

- [ ] **Step 3: Replace the table SQL textarea area in the template**

In the top `.hint` area, replace the always-visible textarea block with:

```vue
<ConditionFilter
  v-if="isTableResult"
  :fields="result.fields || []"
  :columnList="result.columnList || []"
  :filters.sync="toolbar.conditionFilters"
  :generatedSql="generatedFilterSql"
  @apply-row="applyConditionFilters"
  @apply-all="applyConditionFilters"
  @clear="clearConditionFilters"
/>
<div v-else class="relative" style="width:100%;margin-top: 0px;margin-bottom: 6px;position: relative;">
  <el-input
    class="sql-pannel"
    type="textarea"
    :autosize="{ minRows:2, maxRows:8}"
    v-model="toolbar.sql"
    @keypress.native="panelInput"
  />
</div>
```

This keeps non-table result compatibility while table pages use the new condition filter.

- [ ] **Step 4: Add computed properties**

In `computed`, add:

```js
isTableResult() {
  return this.result.tableCount == 1 && this.result.table && this.result.columnList && this.result.columnList.length > 0;
},
generatedFilterSql() {
  if (!this.baseTableSql) {
    return this.result.sql || "";
  }
  return buildTableFilterSql(
    this.baseTableSql,
    this.toolbar.conditionFilters,
    this.result.dbType,
    wrapByDb,
    (type, value) => this.wrapQuote(type, value === "EMPTY" ? "" : value)
  );
},
```

- [ ] **Step 5: Add methods for filter lifecycle**

In `methods`, add:

```js
initConditionFilters() {
  if (!this.isTableResult) {
    this.toolbar.conditionFilters = [];
    this.baseTableSql = "";
    return;
  }

  if (!this.baseTableSql || this.baseTableSql !== this.result.sql && this.toolbar.conditionFilters.length === 0) {
    this.baseTableSql = this.result.sql;
  }

  if (this.toolbar.conditionFilters.length === 0) {
    this.toolbar.conditionFilters = [createDefaultFilterRow(this.result.fields || [])];
  }
},
applyConditionFilters(rowIndex) {
  let rows = this.toolbar.conditionFilters || [];
  if (typeof rowIndex === "number") {
    rows = rows.map((row, index) => ({ ...row, enabled: index === rowIndex ? row.enabled !== false : false }));
  }

  const sql = buildTableFilterSql(
    this.baseTableSql || this.result.sql,
    rows,
    this.result.dbType,
    wrapByDb,
    (type, value) => this.wrapQuote(type, value === "EMPTY" ? "" : value)
  );
  this.execute(sql);
},
clearConditionFilters() {
  this.toolbar.conditionFilters = [createDefaultFilterRow(this.result.fields || [])];
  if (this.baseTableSql || this.result.sql) {
    this.execute(this.baseTableSql || this.result.sql);
  }
},
```

- [ ] **Step 6: Initialize filters when data arrives**

At the end of `handlerData`, after `this.update.lock = false;`, call:

```js
this.initConditionFilters();
```

In `reset()`, after `this.initShowColumn();`, set:

```js
this.baseTableSql = this.result.sql;
this.toolbar.conditionFilters = [];
this.$nextTick(() => this.initConditionFilters());
```

- [ ] **Step 7: Keep old grid filter row from appearing in table mode**

In `reset()`, replace:

```js
if (this.result.columnList) {
  this.result.data.unshift({ isFilter: true, content: "" });
}
```

with:

```js
if (this.result.columnList && !this.isTableResult) {
  this.result.data.unshift({ isFilter: true, content: "" });
}
```

This prevents duplicate top filters in normal table browsing.

- [ ] **Step 8: Run tests and build**

Run:

```powershell
node test/tableFilterSql.test.js
npm run build
```

Expected: both commands pass. Existing webpack warnings may remain.

- [ ] **Step 9: Manual verification**

In Extension Development Host:

1. Open a table from the tree.
2. Confirm condition rows appear above the grid.
3. Add `uid = 2` and click `应用`.
4. Confirm grid reloads.
5. Add a `Raw SQL` row with `uid is not null` and click `全部应用`.
6. Confirm grid reloads.
7. Click `清除过滤器`.
8. Confirm base table data returns without using tree refresh.

- [ ] **Step 10: Commit**

Run:

```powershell
git add src/vue/result/App.vue
git commit -m "feat: apply condition filters on table results"
```

---

### Task 4: Add Query Workspace Webview

**Files:**
- Create: `src/vue/queryWorkspace/main.js`
- Create: `src/vue/queryWorkspace/App.vue`
- Modify: `webpack.config.js`

**Interfaces:**
- Webview emits:
  - `init`
  - `execute` with `{ sql: string }`
  - `next` with `{ sql: string, pageNum: number, pageSize: number }`
  - `export` with existing export option shape
- Webview receives:
  - `RUN`
  - `DATA`
  - `NEXT_PAGE`
  - `COUNT`
  - `DML`
  - `DDL`
  - `MESSAGE_BLOCK`
  - `ERROR`

- [ ] **Step 1: Add query workspace entry**

Create `src/vue/queryWorkspace/main.js`:

```js
import Vue from "vue";
import ElementUI from "element-ui";
import UmyTable from "umy-table";
import "umy-table/lib/theme-chalk/index.css";
import "../result/view.css";
import App from "./App.vue";

Vue.use(ElementUI);
Vue.use(UmyTable);

new Vue({
  render: (h) => h(App),
}).$mount("#app");
```

- [ ] **Step 2: Add query workspace Vue app**

Create `src/vue/queryWorkspace/App.vue`:

```vue
<template>
  <div id="query-workspace">
    <div class="query-workspace__editor">
      <el-input
        class="sql-pannel"
        type="textarea"
        :autosize="{ minRows: 6, maxRows: 12 }"
        v-model="sql"
        @keypress.native="panelInput"
      />
      <div class="query-workspace__actions">
        <el-button size="small" type="primary" @click="runSql">执行</el-button>
        <el-button size="small" @click="exportOption.visible = true" :disabled="!result.data.length">导出</el-button>
        <span class="query-workspace__status" v-if="info.message" :class="{ error: info.error }" @click="resultDialog = true">
          {{ info.error ? "Error" : "Success" }}
        </span>
        <span class="query-workspace__cost">Cost: {{ result.costTime || 0 }}ms</span>
      </div>
    </div>

    <ux-grid
      ref="dataTable"
      :data="filterData"
      v-loading="loading"
      size="small"
      :height="remainHeight"
      width="100vw"
      stripe
    >
      <ux-table-column type="index" width="48" align="center"></ux-table-column>
      <ux-table-column
        v-for="field in result.fields || []"
        :key="field.name"
        :field="field.name"
        :title="field.name"
        :minWidth="computeWidth(field, 0)"
        :resizable="true"
      >
        <template slot-scope="scope">
          <span v-if="scope.row[field.name] === null || scope.row[field.name] === undefined" class="null-column">(NULL)</span>
          <span v-else>{{ formatValue(scope.row[field.name]) }}</span>
        </template>
      </ux-table-column>
    </ux-grid>

    <div class="query-workspace__footer">
      <el-pagination
        small
        layout="prev, pager, next, total"
        :current-page="page.pageNum"
        :page-size="page.pageSize"
        :total="page.total || 0"
        @current-change="jumpPage"
      ></el-pagination>
    </div>

    <el-dialog title="Result" :visible.sync="resultDialog" top="5vh">
      <div v-html="info.message"></div>
      <div class="query-workspace__dialog-sql">SQL: {{ info.sql }}</div>
    </el-dialog>

    <ExportDialog :visible.sync="exportOption.visible" @exportHandle="confirmExport" />
  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode";
import ExportDialog from "../result/component/ExportDialog.vue";

let vscodeEvent;

export default {
  components: { ExportDialog },
  data() {
    return {
      sql: "",
      loading: false,
      remainHeight: 420,
      resultDialog: false,
      result: { data: [], fields: [], costTime: 0, sql: "", table: null },
      page: { pageNum: 1, pageSize: 100, total: 0 },
      table: { widthItem: {}, search: "" },
      info: { message: null, sql: null, error: false },
      exportOption: { visible: false },
    };
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("message", ({ data }) => {
      if (!data) return;
      const response = data.content || {};
      this.loading = false;
      switch (data.type) {
        case "RUN":
          this.sql = response.sql || this.sql;
          this.loading = true;
          break;
        case "DATA":
          this.result = response;
          this.sql = response.sql || this.sql;
          this.result.data = response.data || [];
          this.page.pageSize = response.pageSize || this.page.pageSize;
          this.page.total = response.total != null ? parseInt(response.total) : this.result.data.length;
          this.info.message = null;
          this.info.error = false;
          break;
        case "NEXT_PAGE":
          this.result.data = response.data || [];
          this.result.costTime = response.costTime;
          this.result.sql = response.sql;
          break;
        case "DML":
        case "DDL":
        case "MESSAGE_BLOCK":
          this.info = { message: response.message, sql: response.sql, error: false };
          this.result.costTime = response.costTime;
          break;
        case "ERROR":
          this.info = { message: response.message, sql: response.sql, error: true };
          break;
        case "EXPORT_DONE":
          this.exportOption.visible = false;
          break;
      }
    });
    vscodeEvent.emit("init");
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.resize);
  },
  computed: {
    filterData() {
      return this.result.data || [];
    },
  },
  methods: {
    resize() {
      this.remainHeight = Math.max(240, window.innerHeight - 190);
    },
    panelInput(event) {
      if (event.code === "Enter" && event.ctrlKey) {
        this.runSql();
        event.stopPropagation();
      }
    },
    runSql() {
      if (!this.sql || !this.sql.trim()) return;
      this.loading = true;
      vscodeEvent.emit("execute", { sql: this.sql });
    },
    jumpPage(pageNum) {
      this.page.pageNum = pageNum;
      vscodeEvent.emit("next", {
        sql: this.result.sql || this.sql,
        pageNum,
        pageSize: this.page.pageSize,
      });
      this.loading = true;
    },
    confirmExport(exportOption) {
      vscodeEvent.emit("export", {
        option: { ...exportOption, sql: this.result.sql || this.sql, table: this.result.table },
      });
    },
    formatValue(value) {
      if (value && value.hasOwnProperty && value.hasOwnProperty("type")) {
        return String.fromCharCode.apply(null, new Uint16Array(value.data));
      }
      return value;
    },
    computeWidth(field, index) {
      const key = field.name;
      if (this.table.widthItem[key]) return this.table.widthItem[key];
      if (!this.result.data[index] || index > 10) return 90;
      const value = this.result.data[index][key];
      let width = Math.max((key + "").length * 10, (value + "").length * 10, 90);
      width = Math.min(width, 180);
      const next = this.computeWidth(field, index + 1);
      this.table.widthItem[key] = Math.max(width, next);
      return this.table.widthItem[key];
    },
  },
};
</script>

<style scoped>
#query-workspace {
  padding: 8px 10px 0;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}

.query-workspace__editor {
  border-bottom: 1px solid var(--vscode-textBlockQuote-background);
  padding-bottom: 6px;
}

.query-workspace__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
}

.query-workspace__status {
  cursor: pointer;
  color: #15d422;
}

.query-workspace__status.error {
  color: #d81e06;
}

.query-workspace__cost {
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}

.query-workspace__footer {
  border-top: 1px solid var(--vscode-textBlockQuote-background);
  padding-top: 2px;
}

.query-workspace__dialog-sql {
  margin-top: 10px;
}
</style>
```

- [ ] **Step 3: Add webpack entry and HTML output**

In `webpack.config.js`, update the second config entry:

```js
entry: {
    app: './src/vue/main.js',
    query: './src/vue/result/main.js',
    queryWorkspace: './src/vue/queryWorkspace/main.js'
},
```

Add a new `HtmlWebpackPlugin` after the `result.html` plugin:

```js
new HtmlWebpackPlugin({
    inject: true,
    templateContent: `<head><script src="js/oldCompatible.js"></script></head><body><div id="app"></div></body>`,
    chunks: ['queryWorkspace'],
    filename: 'webview/queryWorkspace.html'
}),
```

- [ ] **Step 4: Build**

Run:

```powershell
npm run build
```

Expected: PASS and `out/webview/queryWorkspace.html` exists.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/vue/queryWorkspace/main.js src/vue/queryWorkspace/App.vue webpack.config.js
git commit -m "feat: add sql query workspace webview"
```

---

### Task 5: Route Database Query Actions to Query Workspace

**Files:**
- Create: `src/service/result/queryWorkspace.ts`
- Modify: `src/service/result/query.ts`
- Modify: `src/service/queryUnit.ts`
- Modify: `src/model/database/connectionNode.ts`
- Modify: `src/model/database/schemaNode.ts`
- Modify: `src/model/database/catalogNode.ts`

**Interfaces:**
- Produces:
  - `QueryWorkspaceMessage = { type: MessageType | string; content: any }`
  - `QueryWorkspacePage.open(connection: Node, initialSql?: string, message?: QueryWorkspaceMessage): Promise<void>`
  - `QueryOption.viewMode?: 'result' | 'workspace'`

- [ ] **Step 1: Extend QueryOption**

In `src/service/queryUnit.ts`, update `QueryOption`:

```ts
export interface QueryOption {
    viewId?: any;
    split?: boolean;
    recordHistory?: boolean;
    runAll?: boolean;
    viewMode?: 'result' | 'workspace';
}
```

- [ ] **Step 2: Create QueryWorkspacePage**

Create `src/service/result/queryWorkspace.ts`:

```ts
import * as vscode from "vscode";
import { ConfigKey, MessageType } from "@/common/constants";
import { Global } from "@/common/global";
import { ViewManager } from "@/common/viewManager";
import { Node } from "@/model/interface/node";
import { EsRequest } from "@/model/es/esRequest";
import { ServiceManager } from "@/service/serviceManager";
import { QueryOption, QueryUnit } from "@/service/queryUnit";
import { ExportService } from "@/service/export/exportService";
import { Util } from "@/common/util";

export interface QueryWorkspaceMessage {
    type: MessageType | string;
    content: any;
}

export class QueryWorkspacePage {
    private static exportService: ExportService = new ExportService();

    public static async open(connection: Node, initialSql: string = "", message?: QueryWorkspaceMessage): Promise<void> {
        const viewId = `QueryWorkspace:${connection.getConnectId({ withSchema: true })}`;

        ViewManager.createWebviewPanel({
            singlePage: true,
            splitView: false,
            path: "queryWorkspace",
            title: vscode.l10n.t("Query"),
            type: viewId,
            iconPath: Global.getExtPath("resources", "icon", "query.svg"),
            eventHandler: (handler) => {
                handler.on("init", () => {
                    if (message) {
                        handler.emit(message.type, {
                            ...message.content,
                            dbType: connection.dbType,
                            viewId,
                        });
                    } else {
                        handler.emit(MessageType.RUN, {
                            sql: initialSql,
                            dbType: connection.dbType,
                            viewId,
                        });
                    }
                }).on("execute", (params) => {
                    const queryOption: QueryOption = {
                        viewId,
                        split: false,
                        recordHistory: true,
                        viewMode: "workspace",
                    };
                    QueryUnit.runQuery(params.sql, connection, {
                        ...queryOption,
                    });
                }).on("next", async (params) => {
                    const executeTime = new Date().getTime();
                    const sql = ServiceManager.getPageService(connection.dbType).build(params.sql, params.pageNum, params.pageSize);
                    connection.execute(sql).then((rows) => {
                        const costTime = new Date().getTime() - executeTime;
                        handler.emit(MessageType.NEXT_PAGE, { sql, data: rows, costTime });
                    });
                }).on("export", (params) => {
                    this.exportService.export({ ...params.option, dbOption: connection }).then(() => {
                        handler.emit("EXPORT_DONE");
                    });
                }).on("changePageSize", (pageSize) => {
                    Global.updateConfig(ConfigKey.DEFAULT_LIMIT, pageSize);
                }).on("esFilter", (query) => {
                    const esQuery = EsRequest.build(initialSql, obj => {
                        obj.query = query;
                    });
                    QueryUnit.runQuery(esQuery, connection, { viewId, split: false, viewMode: "workspace" });
                }).on("copy", value => {
                    Util.copyToBoard(value);
                });
            },
        });
    }
}
```

- [ ] **Step 3: Route QueryPage responses to workspace panels**

In `src/service/result/query.ts`, import:

```ts
import { QueryWorkspacePage } from "./queryWorkspace";
```

At the start of `QueryPage.send`, after `const dbOption: Node = queryParam.connection;`, add:

```ts
if (queryParam.queryOption?.viewMode === "workspace") {
    await QueryPage.adaptData(queryParam);
    queryParam.res.transId = Trans.transId;
    queryParam.res.viewId = queryParam.queryOption?.viewId;
    await QueryWorkspacePage.open(dbOption, "", {
        type: queryParam.type,
        content: queryParam.res,
    });
    return;
}
```

Do not create a second `ViewManager.createWebviewPanel` block in `QueryPage.send`; all workspace init and result delivery stays inside `QueryWorkspacePage.open` so execute, next, export, copy, and page-size handlers remain registered on reused panels.

- [ ] **Step 4: Update database newQuery methods**

In `src/model/database/schemaNode.ts`, replace:

```ts
QueryUnit.showSQLTextDocument(this,'',`${this.schema}.sql`,FileModel.APPEND)
```

with:

```ts
QueryWorkspacePage.open(this);
```

Add import:

```ts
import { QueryWorkspacePage } from "@/service/result/queryWorkspace";
```

Remove the now-unused `FileModel` import if it is unused.

In `src/model/database/catalogNode.ts`, replace:

```ts
QueryUnit.showSQLTextDocument(this,'',`${this.database}.sql`,FileModel.APPEND)
```

with:

```ts
QueryWorkspacePage.open(this);
```

Add the same import and remove unused `FileModel` / `QueryUnit` imports if they become unused.

In `src/model/database/connectionNode.ts`, replace the `await FileManager.show(`${this.label}.sql`);` line in `newQuery()` with:

```ts
await QueryWorkspacePage.open(this);
```

Add import:

```ts
import { QueryWorkspacePage } from "@/service/result/queryWorkspace";
```

Keep the existing schema selection and `ConnectionManager.changeActive(...)` logic after opening the workspace.

- [ ] **Step 5: Build**

Run:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 6: Manual verification**

In Extension Development Host:

1. Click query action on a connection with multiple schemas.
2. Confirm the query workspace opens instead of a `.sql` file.
3. Select the active database when prompted.
4. Type `select 1;` and run with `Ctrl+Enter`.
5. Confirm result grid shows one row.
6. Run an invalid SQL statement.
7. Confirm error message renders in the query workspace.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/service/result/queryWorkspace.ts src/service/result/query.ts src/service/queryUnit.ts src/model/database/connectionNode.ts src/model/database/schemaNode.ts src/model/database/catalogNode.ts
git commit -m "feat: route database queries to workspace"
```

---

### Task 6: Final Verification and Package Check

**Files:**
- No source files expected unless verification finds a bug.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified feature branch state.

- [ ] **Step 1: Run unit test**

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

Expected: PASS. Existing webpack warnings may remain.

- [ ] **Step 3: Package without publishing**

Run:

```powershell
npx --yes @vscode/vsce package --allow-star-activation
```

Expected: PASS and produces `airdb-1.2.7.vsix` or the current package version's VSIX.

- [ ] **Step 4: Inspect Git status**

Run:

```powershell
git status --short
```

Expected: clean working tree or only an intentionally ignored/generated `.vsix`.

- [ ] **Step 5: Final manual smoke**

Manual checks:

1. Table open still works.
2. Table filter row `field = value` works.
3. Raw SQL filter works.
4. Clear filters reloads base SQL.
5. Connection query opens query workspace.
6. Schema query opens query workspace.
7. Query workspace can run `SELECT`.
8. Query workspace shows DML/error messages.

- [ ] **Step 6: Commit any final fixes**

If verification required changes, run:

```powershell
git status --short
git add src/vue/result/App.vue src/vue/result/component/ConditionFilter/index.vue src/vue/result/util/tableFilterSql.js src/vue/queryWorkspace/main.js src/vue/queryWorkspace/App.vue src/service/result/queryWorkspace.ts src/service/result/query.ts src/service/queryUnit.ts src/model/database/connectionNode.ts src/model/database/schemaNode.ts src/model/database/catalogNode.ts webpack.config.js test/tableFilterSql.test.js
git commit -m "fix: stabilize query workspace filters"
```

## Self-Review

- Spec coverage: table filter panel is covered by Tasks 1-3; query workspace and query-action routing are covered by Tasks 4-5; build and packaging verification is covered by Task 6.
- Placeholder scan: the plan contains no undefined behavior, deferred sections, or empty implementation steps.
- Type consistency: `QueryOption.viewMode`, `QueryWorkspacePage.open`, `RAW_SQL_FIELD`, `createDefaultFilterRow`, and `buildTableFilterSql` are named consistently across tasks.
