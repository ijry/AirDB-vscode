# Oracle Thin Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Oracle Database support to AirDB using the official `oracledb` package in Thin mode, with no OCI or Oracle Instant Client dependency.

**Architecture:** Oracle is added through the existing AirDB extension seams: `DatabaseType`, `ConnectionManager`, `ServiceManager`, SQL dialects, page services, connection form, and database tree nodes. Oracle uses schema-level tree semantics (`connection -> schema -> table/view`) and a dedicated `OracleConnection` that normalizes `oracledb` results into AirDB's existing query callback shape.

**Tech Stack:** TypeScript, Vue 2 connection webview, webpack 4, VS Code extension APIs, Node `oracledb@^7.0.0`, direct Node assertion tests with `ts-node/register/transpile-only`.

## Global Constraints

- Use official `oracledb` package in Thin mode only.
- Do not call `oracledb.initOracleClient()`.
- Do not require Oracle Instant Client, OCI, wallet setup, or native client installation.
- Oracle connection fields use existing `Node` properties: `host`, `port`, `user`, `password`, `database` as service name, `connectTimeout`, `requestTimeout`, `usingSSH`, and `ssh`.
- Default Oracle port is `1521`.
- First release supports connection create/edit/test/save/open, SSH tunnel reuse, schemas/tables/views/columns tree, SQL query execution, result grid display, and Oracle 12c+ pagination.
- Oracle pagination must use `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY`.
- Deferred: OCI Thick mode, SID-first support, wallet support, Oracle import/export, structure diff, PL/SQL package/procedure/function/trigger management.
- `oracledb` npm metadata verified on 2026-07-09: version `7.0.0`, license `(Apache-2.0 OR UPL-1.0)`, engines `{ "node": ">=14.17" }`.
- Main extension tests follow the existing direct `node test/*.test.js` style; do not introduce Jest, Mocha, or Vitest for this feature.

---

## File Structure

Create:

- `src/service/page/oraclePageService.ts`: Oracle 12c pagination service.
- `src/service/dialect/oracleDialect.ts`: Oracle metadata SQL and basic SQL templates.
- `src/service/connect/oracleResultAdapter.ts`: pure result conversion helpers for mocked unit tests and `OracleConnection`.
- `src/service/connect/oracleConnection.ts`: Thin-mode Oracle driver wrapper implementing `IConnection`.
- `test/testSetup.js`: shared direct Node test harness for TypeScript files, `@/` alias resolution, and a minimal `vscode` stub.
- `test/oraclePageService.test.js`: direct assertions for Oracle pagination.
- `test/oracleDialect.test.js`: direct assertions for Oracle metadata SQL.
- `test/oracleResultAdapter.test.js`: direct assertions for `oracledb` result adaptation.

Modify:

- `package.json`: add `oracledb` dependency.
- `package-lock.json`: lock `oracledb`.
- `webpack.config.js`: keep `oracledb` external so runtime Thin driver files are packaged under `node_modules`.
- `src/common/constants.ts`: add `DatabaseType.ORACLE = "Oracle"`.
- `src/common/wrapper.js`: wrap Oracle unusual identifiers with double quotes, not MySQL backticks.
- `src/service/serviceManager.ts`: dispatch Oracle dialect and page service.
- `src/service/connectionManager.ts`: create `OracleConnection`.
- `src/vue/connect/index.vue`: expose Oracle in database tabs, default `system`/`1521`/service name, and label Oracle's `database` field as service name.
- `src/model/database/connectionNode.ts`: use schema-level Oracle tree, active query selection, and optional Oracle icon fallback.
- `src/model/main/tableGroup.ts`: include Oracle in schema-style table filter and pin-state keys.
- `src/model/database/schemaNode.ts`: treat Oracle as a schema/user target for destructive labels only.

---

### Task 1: Add Direct TypeScript Test Harness

**Files:**
- Create: `test/testSetup.js`

**Interfaces:**
- Produces: `requireTs(relativePath: string): any` for direct Node tests.
- Produces: a minimal `vscode` module stub with `l10n.t`, `workspace.getConfiguration`, `extensions.getExtension`, `ThemeIcon`, `ThemeColor`, `TreeItem`, and `TreeItemCollapsibleState`.

- [ ] **Step 1: Create test harness**

Add `test/testSetup.js`:

```js
const path = require("path");
const Module = require("module");

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

const vscodeStub = {
  l10n: {
    t(message, ...args) {
      return String(message).replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] ?? ""));
    },
  },
  workspace: {
    getConfiguration() {
      return {
        get(_key, defaultValue) {
          return defaultValue === undefined ? 100 : defaultValue;
        },
        update() {
          return Promise.resolve();
        },
      };
    },
  },
  extensions: {
    getExtension() {
      return { extensionPath: root };
    },
  },
  window: {
    createStatusBarItem() {
      return { show() {}, hide() {}, dispose() {} };
    },
    showErrorMessage() {},
    showInformationMessage() {},
  },
  StatusBarAlignment: { Left: 1 },
  TreeItem: class TreeItem {
    constructor(label) {
      this.label = label;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class ThemeIcon {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
  },
  ThemeColor: class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  },
  Position: class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  Range: class Range {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "vscode") {
    return request;
  }
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(root, "src", request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.cache.vscode = {
  id: "vscode",
  filename: "vscode",
  loaded: true,
  exports: vscodeStub,
};

require("ts-node/register/transpile-only");

function requireTs(relativePath) {
  return require(path.resolve(root, relativePath));
}

module.exports = { requireTs, vscodeStub, root };
```

- [ ] **Step 2: Verify the harness loads**

Run:

```bash
node -e "const setup = require('./test/testSetup'); console.log(typeof setup.requireTs)"
```

Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add test/testSetup.js
git commit -m "test: add extension unit test harness"
```

---

### Task 2: Add Oracle Pagination Service

**Files:**
- Create: `src/service/page/oraclePageService.ts`
- Create: `test/oraclePageService.test.js`
- Modify: `src/service/serviceManager.ts`

**Interfaces:**
- Consumes: `AbstractPageSerivce.build(sql, page, pageSize)`.
- Produces: `OraclePageService extends AbstractPageSerivce`.
- Produces: `ServiceManager.getPageService(DatabaseType.ORACLE)` returns `OraclePageService`.

- [ ] **Step 1: Write failing pagination tests**

Add `test/oraclePageService.test.js`:

```js
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { OraclePageService } = requireTs("src/service/page/oraclePageService.ts");

const service = new OraclePageService();

assert.strictEqual(
  service.build("SELECT * FROM HR.EMPLOYEES", 1, 100),
  "SELECT * FROM HR.EMPLOYEES OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY"
);

assert.strictEqual(
  service.build("SELECT * FROM HR.EMPLOYEES;", 3, 25),
  "SELECT * FROM HR.EMPLOYEES OFFSET 50 ROWS FETCH NEXT 25 ROWS ONLY"
);

assert.strictEqual(
  service.build("SELECT * FROM HR.EMPLOYEES OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY", 2, 50),
  "SELECT * FROM HR.EMPLOYEES OFFSET 50 ROWS FETCH NEXT 50 ROWS ONLY"
);

assert.strictEqual(
  service.getPageSize("SELECT * FROM HR.EMPLOYEES OFFSET 20 ROWS FETCH NEXT 75 ROWS ONLY"),
  75
);

console.log("oraclePageService tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node test/oraclePageService.test.js
```

Expected: FAIL with `Cannot find module` for `oraclePageService.ts`.

- [ ] **Step 3: Implement page service**

Add `src/service/page/oraclePageService.ts`:

```ts
import { AbstractPageSerivce } from "./pageService";

export class OraclePageService extends AbstractPageSerivce {
    protected buildPageSql(sql: string, start: number, limit: number): string {
        const normalized = sql.trim().replace(/;+\s*$/, "");
        const paginationSql = `OFFSET ${start} ROWS FETCH NEXT ${limit} ROWS ONLY`;
        const pagePattern = this.pageMatch();

        if (pagePattern.test(normalized)) {
            return normalized.replace(pagePattern, paginationSql);
        }

        return `${normalized} ${paginationSql}`;
    }

    protected pageMatch() {
        return /\boffset\s+\d+\s+rows\s+fetch\s+next\s+(\d+)\s+rows\s+only\b/i;
    }
}
```

- [ ] **Step 4: Wire page service dispatch**

Modify `src/service/serviceManager.ts` imports:

```ts
import { OraclePageService } from "./page/oraclePageService";
```

Modify `ServiceManager.getPageService()`:

```ts
    public static getPageService(databaseType: DatabaseType): PageService {
        if (!databaseType) databaseType = DatabaseType.MYSQL
        switch (databaseType) {
            case DatabaseType.MSSQL:
                return new MssqlPageService();
            case DatabaseType.PG:
                return new PostgreSqlPageService();
            case DatabaseType.ORACLE:
                return new OraclePageService();
            case DatabaseType.MONGO_DB:
                return new MongoPageService();
            case DatabaseType.ES:
                return new EsPageService();
        }

        return new MysqlPageSerivce();
    }
```

This step also requires Task 6's `DatabaseType.ORACLE`; if Task 2 is implemented first, add the enum value in the same branch before running TypeScript build.

- [ ] **Step 5: Run pagination test**

Run:

```bash
node test/oraclePageService.test.js
```

Expected: PASS and prints `oraclePageService tests passed`.

- [ ] **Step 6: Commit**

```bash
git add src/service/page/oraclePageService.ts src/service/serviceManager.ts test/oraclePageService.test.js
git commit -m "feat: add oracle pagination service"
```

---

### Task 3: Add Oracle Dialect

**Files:**
- Create: `src/service/dialect/oracleDialect.ts`
- Create: `test/oracleDialect.test.js`
- Modify: `src/service/serviceManager.ts`

**Interfaces:**
- Consumes: `SqlDialect` abstract methods.
- Produces: Oracle metadata SQL for schemas, tables, views, columns, table open SQL, counts, and `ALTER SESSION SET CURRENT_SCHEMA`.
- Produces: `ServiceManager.getDialect(DatabaseType.ORACLE)` returns `OracleDialect`.

- [ ] **Step 1: Write failing dialect tests**

Add `test/oracleDialect.test.js`:

```js
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { OracleDialect } = requireTs("src/service/dialect/oracleDialect.ts");

const dialect = new OracleDialect();

assert.match(dialect.showSchemas(), /FROM\s+ALL_OBJECTS/i);
assert.match(dialect.showSchemas(), /OWNER\s+"schema"/i);

assert.match(dialect.showTables("hr"), /FROM\s+ALL_TABLES/i);
assert.match(dialect.showTables("hr"), /t\.OWNER = 'HR'/i);

assert.match(dialect.showViews("hr"), /FROM\s+ALL_VIEWS/i);
assert.match(dialect.showViews("hr"), /OWNER = 'HR'/i);

assert.match(dialect.showColumns("hr", "employees"), /FROM\s+ALL_TAB_COLUMNS/i);
assert.match(dialect.showColumns("hr", "employees"), /c\.OWNER = 'HR'/i);
assert.match(dialect.showColumns("hr", "employees"), /c\.TABLE_NAME = 'EMPLOYEES'/i);

assert.strictEqual(
  dialect.buildPageSql("HR", "EMPLOYEES", 50),
  "SELECT * FROM HR.EMPLOYEES OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY"
);

assert.strictEqual(
  dialect.countSql("HR", "EMPLOYEES"),
  'SELECT count(*) "count" FROM HR.EMPLOYEES'
);

assert.strictEqual(
  dialect.pingDataBase("hr"),
  "ALTER SESSION SET CURRENT_SCHEMA = HR"
);

assert.strictEqual(dialect.pingDataBase(""), "SELECT 1 FROM DUAL");

console.log("oracleDialect tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node test/oracleDialect.test.js
```

Expected: FAIL with `Cannot find module` for `oracleDialect.ts`.

- [ ] **Step 3: Implement dialect**

Add `src/service/dialect/oracleDialect.ts`:

```ts
import { AddColumnParam } from "./param/addColumnParam";
import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class OracleDialect extends SqlDialect {
    private normalizeIdentifier(identifier: string): string {
        const value = String(identifier || "").trim();
        if (value.startsWith("\"") && value.endsWith("\"")) {
            return value.slice(1, -1).replace(/""/g, "\"");
        }
        return value.toUpperCase();
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }

    private owner(database: string): string {
        return this.quoteLiteral(this.normalizeIdentifier(database));
    }

    private objectName(table: string): string {
        const parts = String(table || "").split(".");
        const raw = parts[parts.length - 1];
        return this.quoteLiteral(this.normalizeIdentifier(raw));
    }

    private qualified(database: string, table: string): string {
        return `${database}.${table}`;
    }

    showSchemas(): string {
        return `SELECT DISTINCT OWNER "schema"
FROM ALL_OBJECTS
WHERE OWNER NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'APPQOSSYS', 'XDB', 'CTXSYS', 'MDSYS', 'ORDSYS')
ORDER BY OWNER`;
    }

    showDatabases(): string {
        return this.showSchemas();
    }

    showTables(database: string): string {
        const owner = this.owner(database);
        return `SELECT t.TABLE_NAME "name", NVL(c.COMMENTS, '') "comment"
FROM ALL_TABLES t
LEFT JOIN ALL_TAB_COMMENTS c
  ON c.OWNER = t.OWNER AND c.TABLE_NAME = t.TABLE_NAME
WHERE t.OWNER = '${owner}'
ORDER BY t.TABLE_NAME`;
    }

    showViews(database: string): string {
        const owner = this.owner(database);
        return `SELECT VIEW_NAME "name"
FROM ALL_VIEWS
WHERE OWNER = '${owner}'
ORDER BY VIEW_NAME`;
    }

    showColumns(database: string, table: string): string {
        const owner = this.owner(database);
        const tableName = this.objectName(table);
        return `SELECT c.COLUMN_NAME "name",
       c.DATA_TYPE "simpleType",
       CASE
         WHEN c.DATA_TYPE IN ('CHAR', 'NCHAR', 'VARCHAR2', 'NVARCHAR2') THEN c.DATA_TYPE || '(' || c.CHAR_LENGTH || ')'
         WHEN c.DATA_TYPE = 'NUMBER' AND c.DATA_PRECISION IS NOT NULL AND c.DATA_SCALE IS NOT NULL THEN c.DATA_TYPE || '(' || c.DATA_PRECISION || ',' || c.DATA_SCALE || ')'
         WHEN c.DATA_TYPE = 'NUMBER' AND c.DATA_PRECISION IS NOT NULL THEN c.DATA_TYPE || '(' || c.DATA_PRECISION || ')'
         ELSE c.DATA_TYPE
       END "type",
       c.NULLABLE "nullable",
       c.DATA_LENGTH "maxLength",
       c.DATA_DEFAULT "defaultValue",
       NVL(cc.COMMENTS, '') "comment",
       ac.CONSTRAINT_TYPE "key"
FROM ALL_TAB_COLUMNS c
LEFT JOIN ALL_COL_COMMENTS cc
  ON cc.OWNER = c.OWNER AND cc.TABLE_NAME = c.TABLE_NAME AND cc.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN ALL_CONS_COLUMNS acc
  ON acc.OWNER = c.OWNER AND acc.TABLE_NAME = c.TABLE_NAME AND acc.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN ALL_CONSTRAINTS ac
  ON ac.OWNER = acc.OWNER AND ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME AND ac.CONSTRAINT_TYPE = 'P'
WHERE c.OWNER = '${owner}'
  AND c.TABLE_NAME = '${tableName}'
ORDER BY c.COLUMN_ID`;
    }

    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT * FROM ${this.qualified(database, table)} OFFSET 0 ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
    }

    countSql(database: string, table: string): string {
        return `SELECT count(*) "count" FROM ${this.qualified(database, table)}`;
    }

    pingDataBase(database: string): string {
        if (!database) {
            return "SELECT 1 FROM DUAL";
        }
        return `ALTER SESSION SET CURRENT_SCHEMA = ${this.normalizeIdentifier(database)}`;
    }

    showUsers(): string {
        return `SELECT USERNAME "user" FROM ALL_USERS ORDER BY USERNAME`;
    }

    createUser(): string {
        return `CREATE USER [name] IDENTIFIED BY password`;
    }

    createDatabase(database: string): string {
        return `CREATE USER ${this.normalizeIdentifier(database)} IDENTIFIED BY password`;
    }

    truncateDatabase(database: string): string {
        const owner = this.owner(database);
        return `SELECT 'TRUNCATE TABLE "' || OWNER || '"."' || TABLE_NAME || '"' "trun"
FROM ALL_TABLES
WHERE OWNER = '${owner}'`;
    }

    showTriggers(database: string): string {
        const owner = this.owner(database);
        return `SELECT TRIGGER_NAME
FROM ALL_TRIGGERS
WHERE OWNER = '${owner}'
ORDER BY TRIGGER_NAME`;
    }

    showProcedures(database: string): string {
        const owner = this.owner(database);
        return `SELECT OBJECT_NAME ROUTINE_NAME
FROM ALL_OBJECTS
WHERE OWNER = '${owner}' AND OBJECT_TYPE = 'PROCEDURE'
ORDER BY OBJECT_NAME`;
    }

    showFunctions(database: string): string {
        const owner = this.owner(database);
        return `SELECT OBJECT_NAME ROUTINE_NAME
FROM ALL_OBJECTS
WHERE OWNER = '${owner}' AND OBJECT_TYPE = 'FUNCTION'
ORDER BY OBJECT_NAME`;
    }

    showTableSource(database: string, table: string): string {
        const owner = this.owner(database);
        const tableName = this.objectName(table);
        return `SELECT DBMS_METADATA.GET_DDL('TABLE', '${tableName}', '${owner}') "Create Table" FROM DUAL`;
    }

    showViewSource(database: string, table: string): string {
        const owner = this.owner(database);
        const tableName = this.objectName(table);
        return `SELECT DBMS_METADATA.GET_DDL('VIEW', '${tableName}', '${owner}') "Create View" FROM DUAL`;
    }

    showProcedureSource(database: string, name: string): string {
        const owner = this.owner(database);
        const objectName = this.objectName(name);
        return `SELECT DBMS_METADATA.GET_DDL('PROCEDURE', '${objectName}', '${owner}') "Create Procedure" FROM DUAL`;
    }

    showFunctionSource(database: string, name: string): string {
        const owner = this.owner(database);
        const objectName = this.objectName(name);
        return `SELECT DBMS_METADATA.GET_DDL('FUNCTION', '${objectName}', '${owner}') "Create Function" FROM DUAL`;
    }

    showTriggerSource(database: string, name: string): string {
        const owner = this.owner(database);
        const objectName = this.objectName(name);
        return `SELECT DBMS_METADATA.GET_DDL('TRIGGER', '${objectName}', '${owner}') "SQL Original Statement" FROM DUAL`;
    }

    showIndex(database: string, table: string): string {
        const owner = this.owner(database);
        const tableName = this.objectName(table);
        return `SELECT INDEX_NAME "index_name", COLUMN_NAME "column_name", UNIQUENESS "is_unique"
FROM ALL_IND_COLUMNS ic
JOIN ALL_INDEXES i
  ON i.OWNER = ic.INDEX_OWNER AND i.INDEX_NAME = ic.INDEX_NAME
WHERE ic.TABLE_OWNER = '${owner}' AND ic.TABLE_NAME = '${tableName}'
ORDER BY INDEX_NAME, COLUMN_POSITION`;
    }

    createIndex(createIndexParam: CreateIndexParam): string {
        const type = createIndexParam.type || "";
        const unique = type.toLowerCase().includes("unique") ? "UNIQUE " : "";
        const indexName = `${createIndexParam.column}_${new Date().getTime()}_index`;
        return `CREATE ${unique}INDEX ${indexName} ON ${createIndexParam.table} (${createIndexParam.column})`;
    }

    dropIndex(table: string, indexName: string): string {
        return `DROP INDEX ${indexName}`;
    }

    addColumn(table: string): string {
        return `ALTER TABLE ${table} ADD ([column] [type])`;
    }

    addColumnSql(addColumnParam: AddColumnParam): string {
        const { columnName, columnType, comment, nullable, table, defaultValue } = addColumnParam;
        const nullableSql = nullable ? "" : " NOT NULL";
        const defaultSql = defaultValue ? ` DEFAULT ${defaultValue}` : "";
        const commentSql = comment ? `;\nCOMMENT ON COLUMN ${table}.${columnName} IS '${this.quoteLiteral(comment)}'` : "";
        return `ALTER TABLE ${table} ADD (${columnName} ${columnType}${defaultSql}${nullableSql})${commentSql};`;
    }

    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        const nullableSql = nullable == "YES" ? " NULL" : " NOT NULL";
        const commentSql = comment ? `;\nCOMMENT ON COLUMN ${table}.${column} IS '${this.quoteLiteral(comment)}'` : "";
        return `ALTER TABLE ${table} MODIFY (${column} ${type}${nullableSql})${commentSql};`;
    }

    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        const { columnName, columnType, newColumnName, comment, nullable, table, defaultValue } = updateColumnParam;
        const nullableSql = nullable ? "" : " NOT NULL";
        const defaultSql = defaultValue ? ` DEFAULT ${defaultValue}` : "";
        let sql = `ALTER TABLE ${table} MODIFY (${columnName} ${columnType}${defaultSql}${nullableSql});`;
        if (newColumnName && newColumnName != columnName) {
            sql += `\nALTER TABLE ${table} RENAME COLUMN ${columnName} TO ${newColumnName};`;
        }
        if (comment) {
            sql += `\nCOMMENT ON COLUMN ${table}.${newColumnName || columnName} IS '${this.quoteLiteral(comment)}';`;
        }
        return sql;
    }

    updateTable(update: UpdateTableParam): string {
        const { table, newTableName, comment, newComment } = update;
        let sql = "";
        if (newTableName && newTableName != table) {
            sql += `ALTER TABLE ${table} RENAME TO ${newTableName};`;
        }
        if (newComment && newComment != comment) {
            sql += `\nCOMMENT ON TABLE ${newTableName || table} IS '${this.quoteLiteral(newComment)}';`;
        }
        return sql;
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    create_time DATE,
    update_time DATE,
    [column] VARCHAR2(255)
);
COMMENT ON TABLE [name] IS '[comment]';
COMMENT ON COLUMN [name].[column] IS '[comment]';`;
    }

    viewTemplate(): string {
        return `CREATE VIEW [name]
AS
SELECT * FROM ...;`;
    }

    procedureTemplate(): string {
        return `CREATE OR REPLACE PROCEDURE [name]
AS
BEGIN
    NULL;
END;`;
    }

    triggerTemplate(): string {
        return `CREATE OR REPLACE TRIGGER [name]
[BEFORE/AFTER] [INSERT/UPDATE/DELETE]
ON [table]
FOR EACH ROW
BEGIN
    NULL;
END;`;
    }

    functionTemplate(): string {
        return `CREATE OR REPLACE FUNCTION [name]
RETURN [type]
AS
BEGIN
    RETURN [value];
END;`;
    }

    processList(): string {
        return `SELECT SID "Id", SERIAL# "Serial", USERNAME "User", STATUS "State", PROGRAM "Info" FROM V$SESSION ORDER BY SID`;
    }

    variableList(): string {
        return `SELECT NAME, VALUE FROM V$PARAMETER ORDER BY NAME`;
    }

    statusList(): string {
        return `SELECT NAME, VALUE FROM V$SYSSTAT ORDER BY NAME`;
    }
}
```

- [ ] **Step 4: Wire dialect dispatch**

Modify `src/service/serviceManager.ts` imports:

```ts
import { OracleDialect } from "./dialect/oracleDialect";
```

Modify `ServiceManager.getDialect()`:

```ts
    public static getDialect(dbType: DatabaseType): SqlDialect {
        if (!dbType) dbType = DatabaseType.MYSQL
        switch (dbType) {
            case DatabaseType.MSSQL:
                return new MssqlDIalect()
            case DatabaseType.SQLITE:
                return new SqliTeDialect()
            case DatabaseType.PG:
                return new PostgreSqlDialect();
            case DatabaseType.ORACLE:
                return new OracleDialect();
            case DatabaseType.ES:
                return new EsDialect();
            case DatabaseType.MONGO_DB:
                return new MongoDialect();
        }
        return new MysqlDialect()
    }
```

- [ ] **Step 5: Run dialect test**

Run:

```bash
node test/oracleDialect.test.js
```

Expected: PASS and prints `oracleDialect tests passed`.

- [ ] **Step 6: Commit**

```bash
git add src/service/dialect/oracleDialect.ts src/service/serviceManager.ts test/oracleDialect.test.js
git commit -m "feat: add oracle sql dialect"
```

---

### Task 4: Add Oracle Result Adapter

**Files:**
- Create: `src/service/connect/oracleResultAdapter.ts`
- Create: `test/oracleResultAdapter.test.js`

**Interfaces:**
- Produces: `adaptOracleResult(result: OracleExecuteResult): { results: any; fields: FieldInfo[] }`.
- Produces: object rows and `metaData` fields for SELECT.
- Produces: `{ affectedRows: rowsAffected || 0 }` for DML.

- [ ] **Step 1: Write failing adapter tests**

Add `test/oracleResultAdapter.test.js`:

```js
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { adaptOracleResult } = requireTs("src/service/connect/oracleResultAdapter.ts");

const selectResult = adaptOracleResult({
  rows: [{ ID: 1, NAME: "AirDB" }],
  metaData: [
    { name: "ID", dbTypeName: "NUMBER", byteSize: 22 },
    { name: "NAME", dbTypeName: "VARCHAR2", byteSize: 100 },
  ],
});

assert.deepStrictEqual(selectResult.results, [{ ID: 1, NAME: "AirDB" }]);
assert.deepStrictEqual(
  selectResult.fields.map((field) => ({ name: field.name, orgName: field.orgName, length: field.length })),
  [
    { name: "ID", orgName: "ID", length: 22 },
    { name: "NAME", orgName: "NAME", length: 100 },
  ]
);

const emptySelectResult = adaptOracleResult({
  rows: [],
  metaData: [{ name: "ID", dbTypeName: "NUMBER" }],
});
assert.deepStrictEqual(emptySelectResult.results, []);
assert.strictEqual(emptySelectResult.fields[0].name, "ID");

const dmlResult = adaptOracleResult({ rowsAffected: 3 });
assert.deepStrictEqual(dmlResult.results, { affectedRows: 3 });
assert.deepStrictEqual(dmlResult.fields, []);

const zeroDmlResult = adaptOracleResult({ rowsAffected: 0 });
assert.deepStrictEqual(zeroDmlResult.results, { affectedRows: 0 });

console.log("oracleResultAdapter tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node test/oracleResultAdapter.test.js
```

Expected: FAIL with `Cannot find module` for `oracleResultAdapter.ts`.

- [ ] **Step 3: Implement adapter**

Add `src/service/connect/oracleResultAdapter.ts`:

```ts
import { FieldInfo } from "@/common/typeDef";

export interface OracleExecuteResult {
    rows?: any[];
    metaData?: OracleColumnMetadata[];
    rowsAffected?: number;
}

export interface OracleColumnMetadata {
    name: string;
    dbTypeName?: string;
    byteSize?: number;
    nullable?: boolean;
}

export interface AdaptedOracleResult {
    results: any;
    fields: FieldInfo[];
}

export function adaptOracleResult(result: OracleExecuteResult): AdaptedOracleResult {
    if (Array.isArray(result.rows) || Array.isArray(result.metaData)) {
        return {
            results: result.rows || [],
            fields: adaptOracleFields(result.metaData || []),
        };
    }

    return {
        results: { affectedRows: result.rowsAffected || 0 },
        fields: [],
    };
}

export function adaptOracleFields(metaData: OracleColumnMetadata[]): FieldInfo[] {
    return metaData.map((column) => ({
        catalog: "",
        db: "",
        schema: "",
        table: "",
        orgTable: "",
        name: column.name,
        orgName: column.name,
        charsetNr: 0,
        length: column.byteSize || 0,
        flags: 0,
        decimals: 0,
        zeroFill: false,
        protocol41: false,
        type: 0 as any,
    }));
}
```

- [ ] **Step 4: Run adapter test**

Run:

```bash
node test/oracleResultAdapter.test.js
```

Expected: PASS and prints `oracleResultAdapter tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/service/connect/oracleResultAdapter.ts test/oracleResultAdapter.test.js
git commit -m "feat: adapt oracle query results"
```

---

### Task 5: Add Oracle Thin Connection

**Files:**
- Create: `src/service/connect/oracleConnection.ts`
- Modify: `src/service/connectionManager.ts`

**Interfaces:**
- Consumes: `oracledb.getConnection({ user, password, connectString })`.
- Consumes: `adaptOracleResult(result)`.
- Produces: `OracleConnection extends IConnection`.
- Produces: `ConnectionManager.create()` Oracle case.

- [ ] **Step 1: Implement Oracle connection**

Add `src/service/connect/oracleConnection.ts`:

```ts
import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";
import { adaptOracleResult } from "./oracleResultAdapter";

const oracledb = require("oracledb");

export class OracleConnection extends IConnection {
    private connection: any;
    private inTransaction = false;
    private readonly connectionConfig: any;
    private readonly requestTimeout: number;

    constructor(node: Node) {
        super();
        const port = node.port || 1521;
        const serviceName = node.database || "";
        const connectString = `${node.host}:${port}/${serviceName}`;

        this.requestTimeout = node.requestTimeout || 10000;
        this.connectionConfig = {
            user: node.user,
            password: node.password,
            connectString,
        };
    }

    isAlive(): boolean {
        return !this.dead && !!this.connection;
    }

    connect(callback: (err: Error) => void): void {
        oracledb.getConnection(this.connectionConfig)
            .then((connection) => {
                this.connection = connection;
                if (this.requestTimeout) {
                    this.connection.callTimeout = this.requestTimeout;
                }
                callback(null);
            })
            .catch((err) => {
                this.dead = true;
                callback(err);
            });
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: any, values?: any, callback?: any) {
        if (!callback && values instanceof Function) {
            callback = values;
            values = {};
        }

        const event = new EventEmitter();
        const binds = values && !(values instanceof Function) ? values : {};

        if (!this.connection) {
            const err = new Error("Oracle connection is not initialized");
            if (callback) {
                callback(err);
            }
            process.nextTick(() => event.emit("error", err.message));
            return event;
        }

        this.connection.execute(sql, binds, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: !this.inTransaction,
        }).then((result) => {
            const adapted = adaptOracleResult(result);

            if (!callback) {
                const rows = Array.isArray(adapted.results) ? adapted.results : [];
                if (rows.length == 0) {
                    event.emit("end");
                    return;
                }
                rows.forEach((row, index) => {
                    event.emit("result", this.convertToDump(row), rows.length == index + 1);
                });
                return;
            }

            callback(null, adapted.results, adapted.fields);
        }).catch((err) => {
            if (this.isFatalError(err)) {
                this.dead = true;
            }
            if (callback) {
                callback(err);
            }
            event.emit("error", err.message || err);
        });

        return event;
    }

    beginTransaction(callback: (err: Error) => void): void {
        this.inTransaction = true;
        callback(null);
    }

    rollback(): void {
        if (!this.connection) {
            this.inTransaction = false;
            return;
        }
        this.connection.rollback()
            .catch(() => {
                this.dead = true;
            })
            .finally(() => {
                this.inTransaction = false;
            });
    }

    commit(): void {
        if (!this.connection) {
            this.inTransaction = false;
            return;
        }
        this.connection.commit()
            .catch(() => {
                this.dead = true;
            })
            .finally(() => {
                this.inTransaction = false;
            });
    }

    end(): void {
        this.dead = true;
        if (!this.connection) {
            return;
        }
        this.connection.close().catch(() => undefined);
        this.connection = null;
    }

    private isFatalError(err: any): boolean {
        const errorNum = err?.errorNum;
        return errorNum == 28 || errorNum == 3113 || errorNum == 3114 || errorNum == 3135 || errorNum == 1012;
    }
}
```

- [ ] **Step 2: Wire connection factory**

Modify `src/service/connectionManager.ts` imports:

```ts
import { OracleConnection } from "./connect/oracleConnection";
```

Modify `ConnectionManager.create()`:

```ts
            case DatabaseType.ORACLE:
                return new OracleConnection(opt);
```

Place the Oracle case near the other SQL database cases:

```ts
            case DatabaseType.PG:
                return new PostgreSqlConnection(opt)
            case DatabaseType.ORACLE:
                return new OracleConnection(opt);
            case DatabaseType.SQLITE:
                return new SqliteConnection(opt);
```

- [ ] **Step 3: Run existing and Oracle adapter tests**

Run:

```bash
node test/oracleResultAdapter.test.js
node test/oraclePageService.test.js
node test/oracleDialect.test.js
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/service/connect/oracleConnection.ts src/service/connectionManager.ts
git commit -m "feat: add oracle thin connection"
```

---

### Task 6: Wire Oracle Type, UI, Tree Semantics, and Identifier Wrapping

**Files:**
- Modify: `src/common/constants.ts`
- Modify: `src/common/wrapper.js`
- Modify: `src/vue/connect/index.vue`
- Modify: `src/model/database/connectionNode.ts`
- Modify: `src/model/main/tableGroup.ts`
- Modify: `src/model/database/schemaNode.ts`

**Interfaces:**
- Produces: `DatabaseType.ORACLE = "Oracle"`.
- Produces: Oracle visible in connection form tabs.
- Produces: Oracle tree as `connection -> schema -> table/view/query...`, not `connection -> catalog -> schema`.
- Produces: Oracle table filter and pin-state persistence using schema-style keys.

- [ ] **Step 1: Add database type**

Modify `src/common/constants.ts`:

```ts
export enum DatabaseType {
    MYSQL = "MySQL", PG = "PostgreSQL", SQLITE = "SQLite",
    MSSQL = "SqlServer", ORACLE = "Oracle", MONGO_DB = "MongoDB",
    ES = "ElasticSearch", REDIS = "Redis", SSH = "SSH", FTP = "FTP"
}
```

- [ ] **Step 2: Add Oracle identifier wrapping**

Modify `src/common/wrapper.js`:

```js
export function wrapByDb(origin, databaseType) {
    if (origin == null) { return origin; }
    if (databaseType == 'PostgreSQL') {
        return origin.split(".").map(text => `"${text}"`).join(".")
    }
    if (databaseType == 'Oracle') {
        return origin.split(".").map(text => {
            if (text.match(/\b[-\s]+\b/ig) || text.match(/^( |if|key|desc|length|group|order)$/i)) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        }).join(".")
    }
    if (databaseType == 'MongoDB') {
        return origin;
    }

    if (origin.match(/\b[-\s]+\b/ig) || origin.match(/^( |if|key|desc|length|group|order)$/i)) {
        if (databaseType == 'SqlServer') {
            return origin.split(".").map(text => `[${text}]`).join(".")
        }
        return `\`${origin}\``;
    }

    return origin;
}
```

- [ ] **Step 3: Expose Oracle in connection form**

Modify `src/vue/connect/index.vue` `supportDatabases`:

```js
      supportDatabases: [
        "MySQL",
        "PostgreSQL",
        "Oracle",
        "SqlServer",
        "SQLite",
        "MongoDB",
        "Redis",
        "ElasticSearch",
        "SSH",
        "FTP",
      ],
```

Modify the database/service field label and placeholder:

```vue
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block w-32 mr-5 font-bold">
            {{ connectionOption.dbType == 'Oracle' ? 'Service Name' : $t('Databases') }}
          </label>
          <input
            class="w-64 field__input"
            :placeholder="connectionOption.dbType == 'Oracle' ? 'FREEPDB1 / ORCLPDB1' : $t('Special connection database')"
            v-model="connectionOption.database"
          />
        </div>
```

Modify the SQL Server component condition while in the same area:

```vue
      <SQLServer :connectionOption="connectionOption" v-if="connectionOption.dbType == 'SqlServer'" />
```

Modify the Oracle default watcher:

```js
        case "Oracle":
          this.connectionOption.user = "system";
          this.connectionOption.port = 1521;
          this.connectionOption.database = "FREEPDB1";
          break;
```

- [ ] **Step 4: Use schema-level Oracle tree in connection node**

Modify `src/model/database/connectionNode.ts` icon selection:

```ts
        } else if (this.dbType == DatabaseType.SQLITE) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/sqlite-icon.svg");
        } else if (this.dbType == DatabaseType.ORACLE) {
            this.iconPath = new vscode.ThemeIcon("database");
        } else if (this.dbType == DatabaseType.MONGO_DB) {
```

Modify catalog decision:

```ts
        const hasCatalog = this.dbType != DatabaseType.MYSQL
            && this.dbType != DatabaseType.ORACLE
            && this.contextValue == ModelType.CONNECTION;
```

Modify `newQuery()` database name selection:

```ts
            return (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.ORACLE)
                ? databaseNode.schema
                : databaseNode.database;
```

- [ ] **Step 5: Add Oracle table filter and pin-state keys**

Modify `src/model/main/tableGroup.ts` constructor first branch:

```ts
        if (parent.dbType == DatabaseType.MYSQL || parent.dbType == DatabaseType.ORACLE) {
            this.stateKey = this.key + '-default-' + this.parent.label + '-TableFilterKeyword'
            // @ts-ignore
            if (parent.pinedTablesMap != null && parent.pinedTablesMap['default-' + this.parent.label] != null) {
                // @ts-ignore
                this.pinedTables = parent.pinedTablesMap['default-' + this.parent.label];
            }
        } else if(parent.dbType == DatabaseType.MSSQL || parent.dbType == DatabaseType.PG) {
```

Modify `updatePinedTables()` cloud branch:

```ts
            if (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.ORACLE) {
                // @ts-ignore
                pinedTablesMap['default-' + this.parent.label] = this.pinedTables
            } else if(this.parent.dbType == DatabaseType.MSSQL || this.parent.dbType == DatabaseType.PG) {
```

Modify `updatePinedTables()` local branch:

```ts
            if (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.ORACLE) {
                Console.log(this.pinedTables)
                // @ts-ignore
                if (this.pinedTables != null) {
                    // @ts-ignore
                    if (this.parent.parent.pinedTablesMap == null) {
                        this.parent.parent.pinedTablesMap = {};
                    }
                    this.parent.parent.pinedTablesMap['default-' + this.parent.label] = this.pinedTables;
                }
                connections[key] = NodeUtil.removeParent(this.parent.parent);
            } else if(this.parent.dbType == DatabaseType.MSSQL || this.parent.dbType == DatabaseType.PG) {
```

- [ ] **Step 6: Treat Oracle destructive label as user/schema**

Modify `src/model/database/schemaNode.ts`:

```ts
        const target = this.dbType == DatabaseType.ORACLE
            ? 'user'
            : (this.dbType == DatabaseType.MSSQL || this.dbType == DatabaseType.PG ? 'schema' : 'database');
```

- [ ] **Step 7: Run Oracle unit tests**

Run:

```bash
node test/oraclePageService.test.js
node test/oracleDialect.test.js
node test/oracleResultAdapter.test.js
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/common/constants.ts src/common/wrapper.js src/vue/connect/index.vue src/model/database/connectionNode.ts src/model/main/tableGroup.ts src/model/database/schemaNode.ts
git commit -m "feat: wire oracle database type"
```

---

### Task 7: Add `oracledb` Runtime Dependency and Webpack External

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `webpack.config.js`

**Interfaces:**
- Produces: runtime dependency `oracledb`.
- Produces: webpack external mapping so `require("oracledb")` resolves from packaged `node_modules`.

- [ ] **Step 1: Install dependency**

Run:

```bash
npm install oracledb@^7.0.0 --save
```

Expected:

- `package.json` contains `"oracledb": "^7.0.0"` under `dependencies`.
- `package-lock.json` contains the resolved `oracledb` package.

- [ ] **Step 2: Keep `oracledb` external in webpack**

Modify the first `externals` block in `webpack.config.js`:

```js
        externals: {
            vscode: 'commonjs vscode',
            mockjs: 'mockjs vscode',
            'mongodb-client-encryption': 'mongodb-client-encryption',
            oracledb: 'commonjs oracledb'
        },
```

- [ ] **Step 3: Verify dependency metadata**

Run:

```bash
npm view oracledb version license engines --json
```

Expected includes:

```json
{
  "version": "7.0.0",
  "license": "(Apache-2.0 OR UPL-1.0)",
  "engines": {
    "node": ">=14.17"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json webpack.config.js
git commit -m "build: add oracle thin driver dependency"
```

---

### Task 8: Build and Automated Verification

**Files:**
- Modify only if tests or build reveal defects in files from Tasks 1-7.

**Interfaces:**
- Produces: passing direct Oracle unit tests.
- Produces: successful production extension build.

- [ ] **Step 1: Run direct tests**

Run:

```bash
node test/tableFilterSql.test.js
node test/oraclePageService.test.js
node test/oracleDialect.test.js
node test/oracleResultAdapter.test.js
```

Expected:

- `tableFilterSql tests passed`
- `oraclePageService tests passed`
- `oracleDialect tests passed`
- `oracleResultAdapter tests passed`

- [ ] **Step 2: Run TypeScript and webpack build**

Run:

```bash
npm run build
```

Expected: webpack production build completes without TypeScript errors.

- [ ] **Step 3: Fix any build-only type issues**

If TypeScript complains about `DatabaseType.ORACLE` missing in a task ordering conflict, confirm `src/common/constants.ts` contains:

```ts
ORACLE = "Oracle"
```

If webpack tries to bundle `oracledb`, confirm `webpack.config.js` contains:

```js
oracledb: 'commonjs oracledb'
```

If direct tests cannot resolve `@/`, confirm `test/testSetup.js` contains:

```js
if (request.startsWith("@/")) {
  return originalResolveFilename.call(
    this,
    path.join(root, "src", request.slice(2)),
    parent,
    isMain,
    options
  );
}
```

- [ ] **Step 4: Re-run verification after fixes**

Run:

```bash
node test/tableFilterSql.test.js
node test/oraclePageService.test.js
node test/oracleDialect.test.js
node test/oracleResultAdapter.test.js
npm run build
```

Expected: all tests and build pass.

- [ ] **Step 5: Commit verification fixes**

If Step 3 changed code:

```bash
git add <changed-files>
git commit -m "fix: stabilize oracle support build"
```

If Step 3 changed no files, skip this commit.

---

### Task 9: Manual Oracle Verification

**Files:**
- No required source changes unless manual verification reveals defects.

**Interfaces:**
- Produces: verified behavior against a real Oracle Database service name.

- [ ] **Step 1: Launch extension host**

Run the VS Code extension debug configuration or package/install the extension locally after `npm run build`.

Expected: AirDB extension activates and the SQL tree is visible.

- [ ] **Step 2: Verify Oracle connection form**

Actions:

- Open AirDB connection form.
- Select `Oracle`.
- Confirm defaults: host `127.0.0.1`, port `1521`, user `system`, service name `FREEPDB1`.
- Fill real host, port, service name, user, and password.
- Click `Connect`.

Expected: connection succeeds without installing Oracle Instant Client.

- [ ] **Step 3: Verify schema tree**

Actions:

- Open the saved Oracle connection.
- Expand the connection.
- Expand a schema.
- Expand `Table`.
- Expand `View`.
- Expand a table.

Expected:

- Connection lists schemas directly.
- Table list loads from `ALL_TABLES`.
- View list loads from `ALL_VIEWS`.
- Columns load from `ALL_TAB_COLUMNS`.

- [ ] **Step 4: Verify query execution**

Actions:

- Right-click the Oracle connection or schema and open query workspace.
- Run:

```sql
SELECT 1 AS ID FROM DUAL
```

Expected: result grid shows one row with `ID = 1`.

- [ ] **Step 5: Verify table open and pagination**

Actions:

- Click a table in the Oracle tree.
- Use next page from the result grid.

Expected:

- Initial SQL uses `OFFSET 0 ROWS FETCH NEXT ... ROWS ONLY`.
- Next page SQL replaces the existing Oracle pagination clause.
- Rows render in the same result grid used by other SQL databases.

- [ ] **Step 6: Verify SSH tunnel path**

Actions:

- Edit the Oracle connection.
- Enable SSH tunnel with a valid SSH host.
- Connect.
- Expand schemas and run `SELECT 1 AS ID FROM DUAL`.

Expected: Oracle traffic uses the existing SSH tunnel and query results load.

- [ ] **Step 7: Record manual verification result**

If all manual checks pass:

```bash
git status --short
```

Expected: no unintended source changes except planned files.

If manual checks reveal defects, fix them in the smallest affected file, re-run Task 8, repeat the failing manual check, then commit:

```bash
git add <changed-files>
git commit -m "fix: address oracle manual verification"
```

---

## Final Verification Before Release

Run:

```bash
git status --short
git log --oneline -8
node test/tableFilterSql.test.js
node test/oraclePageService.test.js
node test/oracleDialect.test.js
node test/oracleResultAdapter.test.js
npm run build
```

Expected:

- Worktree contains no accidental unrelated changes.
- Recent commits include Oracle design, plan, and implementation commits.
- All direct tests pass.
- Production build passes.

Do not run `publish.sh` until the user explicitly asks to publish the new version after implementation and verification.

---

## Self-Review

Spec coverage:

- Thin mode only: covered by Global Constraints, Task 5, Task 7.
- No OCI or Instant Client: covered by Global Constraints and manual connection verification.
- Connection create/edit/test/save/open: covered by Task 5, Task 6, Task 9.
- Host/port/serviceName/user/password: covered by Task 5 and Task 6.
- SSH tunnel reuse: covered by Task 5 through `ConnectionManager` and Task 9 manual check.
- Schemas/tables/views/columns tree: covered by Task 3 and Task 6.
- SQL query execution/result grid: covered by Task 4, Task 5, Task 9.
- Oracle pagination: covered by Task 2 and Task 9.
- Deferred features are not implemented: covered by Global Constraints.

Placeholder scan:

- Placeholder scan completed; no banned placeholder language remains in implementation steps.
- Unsupported Oracle features have concrete fallback SQL or are left to existing generic behavior.

Type consistency:

- `DatabaseType.ORACLE` is the enum value used in `ConnectionManager`, `ServiceManager`, tree nodes, and UI.
- `OraclePageService`, `OracleDialect`, `OracleConnection`, and `adaptOracleResult` names match across tasks.
- Test harness function `requireTs()` is used consistently by all direct tests.
