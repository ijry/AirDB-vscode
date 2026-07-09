# Dameng Kingbase Import Export Procedures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete Dameng support through `dmdb`, and extend KingbaseES with dedicated import, export, and complex routine handling.

**Architecture:** Dameng is implemented as a first-class database type with its own connection wrapper, result adapter, dialect, page service, import service, dump service, UI defaults, and tests. Kingbase keeps the official vendored Nodejs driver but gets dialect overrides, import parsing, and dump profile support for PostgreSQL-style routines. Import/export share small SQL script parser and dump profile helpers instead of duplicating logic in each database service.

**Tech Stack:** TypeScript, VS Code extension APIs, Node.js, `dmdb@1.0.49630`, existing Kingbase official Nodejs driver, existing AirDB `IConnection`, `SqlDialect`, `PageService`, `ImportService`, and `DumpService` seams.

## Global Constraints

- Dameng must use the official `dmdb` npm package, pinned to `1.0.49630`.
- Dameng must not depend on OCI, Oracle Instant Client, or a vendored driver directory.
- KingbaseES must keep using `resources/drivers/kingbase/node_modules/kb`.
- Import/export baseline must work through AirDB Node connections and must not require local CLIs.
- Complex routine scripts must preserve semicolons inside procedure/function/trigger bodies.
- Kingbase routine scripts must support PostgreSQL dollar quotes such as `$$` and `$body$`.
- Dameng routine scripts must support `/` on its own line as the routine terminator.
- Driver errors in callback query mode must not emit unhandled `error` events.
- Work in small commits after each task passes its focused tests.

---

## File Structure

Create:

- `src/service/import/sqlScriptBatchParser.ts`: shared parser for semicolon, dollar-quoted, and slash-terminated SQL scripts.
- `src/service/import/kingbaseImportService.ts`: Kingbase import service using the shared parser.
- `src/service/import/damengImportService.ts`: Dameng import service using the shared parser.
- `src/service/dump/sqlScriptDumpProfile.ts`: database-specific dump profile interfaces and profile factories.
- `src/service/dump/sqlScriptDumpService.ts`: shared dump implementation that reuses `DumpService` picker behavior with profile-driven SQL generation.
- `src/service/dump/kingbaseDumpService.ts`: Kingbase dump profile service.
- `src/service/dump/damengDumpService.ts`: Dameng dump profile service.
- `src/service/connect/damengResultAdapter.ts`: pure Dameng result normalization.
- `src/service/connect/damengConnection.ts`: `dmdb`-backed AirDB connection.
- `src/service/dialect/damengDialect.ts`: Dameng metadata and DDL dialect.
- `src/service/page/damengPageService.ts`: Dameng pagination service.
- `test/sqlScriptBatchParser.test.js`
- `test/sqlScriptDumpProfile.test.js`
- `test/kingbaseRoutineDialect.test.js`
- `test/kingbaseImportExportRegistration.test.js`
- `test/damengResultAdapter.test.js`
- `test/damengConnection.test.js`
- `test/damengDialect.test.js`
- `test/damengPageService.test.js`
- `test/damengServiceIntegration.test.js`
- `test/damengUiConfig.test.js`

Modify:

- `package.json`: add `dmdb`.
- `package-lock.json`: update lockfile after install.
- `src/common/constants.ts`: add `DatabaseType.DAMENG`.
- `src/service/dialect/kingbaseDialect.ts`: add routine overrides and templates.
- `src/service/serviceManager.ts`: register Dameng services; register Kingbase import/dump services.
- `src/service/connectionManager.ts`: create `DamengConnection`.
- `src/model/database/connectionNode.ts`: Dameng icon/tree behavior.
- `src/model/database/schemaNode.ts`: Dameng schema drop label behavior.
- `src/model/main/tableGroup.ts`: include Dameng where schema-style grouping is required.
- `src/provider/treeDataProvider.ts`: Dameng active schema handling.
- `src/vue/connect/index.vue`: add Dameng selector/defaults/logo/SSL visibility.
- `src/model/main/procedure.ts`, `src/model/main/function.ts`, `src/model/main/trigger.ts`: defensive source fallback for `CREATE_SQL`.

---

### Task 1: Shared SQL Script Batch Parser

**Files:**
- Create: `src/service/import/sqlScriptBatchParser.ts`
- Test: `test/sqlScriptBatchParser.test.js`

**Interfaces:**
- Produces: `parseSqlScriptBatches(sql: string, mode?: "default" | "kingbase" | "dameng"): string[]`
- Consumes: only plain strings; no VS Code APIs.

- [ ] **Step 1: Write parser tests**

Create `test/sqlScriptBatchParser.test.js`:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { parseSqlScriptBatches } = requireTs("src/service/import/sqlScriptBatchParser.ts");

assert.deepStrictEqual(parseSqlScriptBatches("select 1; select 2;"), ["select 1", "select 2"]);
assert.deepStrictEqual(parseSqlScriptBatches("select ';' as semi;"), ["select ';' as semi"]);
assert.deepStrictEqual(parseSqlScriptBatches("select 1; -- comment ;\nselect 2;"), ["select 1", "-- comment ;\nselect 2"]);
assert.deepStrictEqual(parseSqlScriptBatches("select /* ; */ 1;"), ["select /* ; */ 1"]);

const kingbaseProcedure = `
CREATE PROCEDURE public.demo_proc()
LANGUAGE plpgsql
AS $body$
BEGIN
  RAISE NOTICE 'a;b';
END;
$body$;
SELECT 1;
`;
assert.deepStrictEqual(parseSqlScriptBatches(kingbaseProcedure, "kingbase"), [
  "CREATE PROCEDURE public.demo_proc()\nLANGUAGE plpgsql\nAS $body$\nBEGIN\n  RAISE NOTICE 'a;b';\nEND;\n$body$",
  "SELECT 1",
]);

const damengProcedure = `
CREATE OR REPLACE PROCEDURE DEMO_PROC
AS
BEGIN
  SELECT 1;
END;
/
SELECT 2;
`;
assert.deepStrictEqual(parseSqlScriptBatches(damengProcedure, "dameng"), [
  "CREATE OR REPLACE PROCEDURE DEMO_PROC\nAS\nBEGIN\n  SELECT 1;\nEND;",
  "SELECT 2",
]);

console.log("sqlScriptBatchParser tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sqlScriptBatchParser.test.js`

Expected: FAIL because `src/service/import/sqlScriptBatchParser.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `src/service/import/sqlScriptBatchParser.ts` with:

```typescript
export type SqlScriptMode = "default" | "kingbase" | "dameng";

export function parseSqlScriptBatches(sql: string, mode: SqlScriptMode = "default"): string[] {
    const batches: string[] = [];
    let current = "";
    let quote: "'" | "\"" | null = null;
    let dollarQuote: string | null = null;
    let lineComment = false;
    let blockComment = false;

    const push = () => {
        const statement = current.trim();
        if (statement) {
            batches.push(statement);
        }
        current = "";
    };

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const next = sql[i + 1];

        if (lineComment) {
            current += char;
            if (char === "\n") {
                lineComment = false;
            }
            continue;
        }

        if (blockComment) {
            current += char;
            if (char === "*" && next === "/") {
                current += next;
                i++;
                blockComment = false;
            }
            continue;
        }

        if (quote) {
            current += char;
            if (char === quote) {
                if (next === quote) {
                    current += next;
                    i++;
                } else {
                    quote = null;
                }
            }
            continue;
        }

        if (dollarQuote) {
            if (sql.startsWith(dollarQuote, i)) {
                current += dollarQuote;
                i += dollarQuote.length - 1;
                dollarQuote = null;
            } else {
                current += char;
            }
            continue;
        }

        if (char === "-" && next === "-") {
            current += char + next;
            i++;
            lineComment = true;
            continue;
        }

        if (char === "/" && next === "*") {
            current += char + next;
            i++;
            blockComment = true;
            continue;
        }

        if (char === "'" || char === "\"") {
            quote = char;
            current += char;
            continue;
        }

        if (mode === "kingbase" && char === "$") {
            const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
            if (match) {
                dollarQuote = match[0];
                current += dollarQuote;
                i += dollarQuote.length - 1;
                continue;
            }
        }

        if (mode === "dameng" && char === "/" && isSlashTerminator(sql, i)) {
            push();
            continue;
        }

        if (char === ";") {
            push();
            continue;
        }

        current += char;
    }

    push();
    return batches;
}

function isSlashTerminator(sql: string, index: number): boolean {
    const beforeLineStart = sql.lastIndexOf("\n", index - 1) + 1;
    const afterLineEndIndex = sql.indexOf("\n", index + 1);
    const afterLineEnd = afterLineEndIndex === -1 ? sql.length : afterLineEndIndex;
    const line = sql.slice(beforeLineStart, afterLineEnd).trim();
    return line === "/";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/sqlScriptBatchParser.test.js`

Expected: `sqlScriptBatchParser tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/service/import/sqlScriptBatchParser.ts test/sqlScriptBatchParser.test.js
git commit -m "feat: add sql script batch parser"
```

---

### Task 2: Shared SQL Dump Profiles

**Files:**
- Create: `src/service/dump/sqlScriptDumpProfile.ts`
- Create: `src/service/dump/sqlScriptDumpService.ts`
- Test: `test/sqlScriptDumpProfile.test.js`

**Interfaces:**
- Consumes: `Node`, selected object names, and source SQL from dialect methods.
- Produces:
  - `SqlScriptDumpProfile`
  - `createKingbaseDumpProfile(): SqlScriptDumpProfile`
  - `createDamengDumpProfile(): SqlScriptDumpProfile`
  - `SqlScriptDumpService extends DumpService`

- [ ] **Step 1: Write dump profile tests**

Create `test/sqlScriptDumpProfile.test.js`:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const {
  createKingbaseDumpProfile,
  createDamengDumpProfile,
  buildInsertStatement,
  appendRoutineTerminator,
} = requireTs("src/service/dump/sqlScriptDumpProfile.ts");

const kingbase = createKingbaseDumpProfile();
const dameng = createDamengDumpProfile();

assert.strictEqual(kingbase.qualify("public", "demo"), "\"public\".\"demo\"");
assert.strictEqual(dameng.qualify("SYSDBA", "DEMO"), "\"SYSDBA\".\"DEMO\"");
assert.strictEqual(kingbase.dropTable("public", "demo"), "DROP TABLE IF EXISTS \"public\".\"demo\";");
assert.strictEqual(dameng.dropTable("SYSDBA", "DEMO"), "DROP TABLE IF EXISTS \"SYSDBA\".\"DEMO\";");

assert.strictEqual(
  buildInsertStatement(kingbase, "public", "demo", [{ id: 1, name: "AirDB" }]),
  "INSERT INTO \"public\".\"demo\" (\"id\",\"name\") VALUES (1,'AirDB');"
);
assert.strictEqual(
  buildInsertStatement(dameng, "SYSDBA", "DEMO", [{ ID: 1, NAME: null }]),
  "INSERT INTO \"SYSDBA\".\"DEMO\" (\"ID\",\"NAME\") VALUES (1,NULL);"
);

assert.strictEqual(appendRoutineTerminator(kingbase, "CREATE PROCEDURE p AS $$ BEGIN END; $$"), "CREATE PROCEDURE p AS $$ BEGIN END; $$;");
assert.strictEqual(appendRoutineTerminator(dameng, "CREATE OR REPLACE PROCEDURE P AS BEGIN NULL; END;"), "CREATE OR REPLACE PROCEDURE P AS BEGIN NULL; END;\n/");

console.log("sqlScriptDumpProfile tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/sqlScriptDumpProfile.test.js`

Expected: FAIL because profile helpers do not exist.

- [ ] **Step 3: Implement profile helpers**

Create `src/service/dump/sqlScriptDumpProfile.ts` with:

```typescript
import * as sqlstring from "sqlstring";

export interface SqlScriptDumpProfile {
    name: "kingbase" | "dameng";
    quote(identifier: string): string;
    qualify(schema: string, objectName: string): string;
    dropTable(schema: string, table: string): string;
    dropView(schema: string, view: string): string;
    routineTerminator: ";" | "\n/";
}

export function createKingbaseDumpProfile(): SqlScriptDumpProfile {
    return createDoubleQuoteProfile("kingbase", ";");
}

export function createDamengDumpProfile(): SqlScriptDumpProfile {
    return createDoubleQuoteProfile("dameng", "\n/");
}

export function buildInsertStatement(profile: SqlScriptDumpProfile, schema: string, table: string, rows: any[]): string {
    if (!rows.length) {
        return "";
    }
    const columns = Object.keys(rows[0]);
    const columnSql = columns.map((column) => profile.quote(column)).join(",");
    const valuesSql = rows.map((row) => `(${columns.map((column) => escapeValue(row[column])).join(",")})`).join(",");
    return `INSERT INTO ${profile.qualify(schema, table)} (${columnSql}) VALUES ${valuesSql};`;
}

export function appendRoutineTerminator(profile: SqlScriptDumpProfile, sql: string): string {
    const trimmed = String(sql || "").trim().replace(/;+\s*$/, "");
    if (!trimmed) {
        return "";
    }
    return `${trimmed}${profile.routineTerminator}`;
}

function createDoubleQuoteProfile(name: "kingbase" | "dameng", routineTerminator: ";" | "\n/"): SqlScriptDumpProfile {
    const quote = (identifier: string) => `"${String(identifier || "").replace(/"/g, "\"\"")}"`;
    return {
        name,
        quote,
        qualify(schema: string, objectName: string): string {
            return `${quote(schema)}.${quote(objectName)}`;
        },
        dropTable(schema: string, table: string): string {
            return `DROP TABLE IF EXISTS ${this.qualify(schema, table)};`;
        },
        dropView(schema: string, view: string): string {
            return `DROP VIEW IF EXISTS ${this.qualify(schema, view)};`;
        },
        routineTerminator,
    };
}

function escapeValue(value: any): string {
    if (value === null || typeof value === "undefined") {
        return "NULL";
    }
    if (value instanceof Date) {
        return sqlstring.escape(value);
    }
    return sqlstring.escape(value);
}
```

Create `src/service/dump/sqlScriptDumpService.ts` by extracting the picker flow from `DumpService` into a subclass that:

- receives a `SqlScriptDumpProfile` in the constructor.
- calls the existing `triggerSave(node)`.
- uses selected table/view/procedure/function/trigger names.
- calls `node.dialect.show*Source` and writes returned source through `appendRoutineTerminator`.
- streams table data through `ConnectionManager.getConnection(node, { sessionId })`.
- writes inserts through `buildInsertStatement`.

Keep this class narrow; do not alter `DumpService` behavior for other databases.

- [ ] **Step 4: Run test to verify profile helpers pass**

Run: `node test/sqlScriptDumpProfile.test.js`

Expected: `sqlScriptDumpProfile tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/service/dump/sqlScriptDumpProfile.ts src/service/dump/sqlScriptDumpService.ts test/sqlScriptDumpProfile.test.js
git commit -m "feat: add sql dump profiles"
```

---

### Task 3: Kingbase Routine, Import, And Export Support

**Files:**
- Modify: `src/service/dialect/kingbaseDialect.ts`
- Create: `src/service/import/kingbaseImportService.ts`
- Create: `src/service/dump/kingbaseDumpService.ts`
- Modify: `src/service/serviceManager.ts`
- Test: `test/kingbaseRoutineDialect.test.js`
- Test: `test/kingbaseImportExportRegistration.test.js`

**Interfaces:**
- Consumes: `parseSqlScriptBatches(sql, "kingbase")`
- Produces:
  - `KingbaseImportService extends ImportService`
  - `KingbaseDumpService extends SqlScriptDumpService`
  - `ServiceManager.getImportService(DatabaseType.KINGBASE)`
  - `ServiceManager.getDumpService(DatabaseType.KINGBASE)`

- [ ] **Step 1: Write Kingbase routine dialect test**

Create `test/kingbaseRoutineDialect.test.js`:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { KingbaseDialect } = requireTs("src/service/dialect/kingbaseDialect.ts");

const dialect = new KingbaseDialect();

assert.match(dialect.showProcedures("public"), /pg_proc/i);
assert.match(dialect.showProcedures("public"), /prokind\s*=\s*'p'/i);
assert.match(dialect.showFunctions("public"), /pg_proc/i);
assert.match(dialect.showFunctions("public"), /prokind\s+IN\s+\('f','a','w'\)/i);
assert.match(dialect.showProcedureSource("public", "demo_proc"), /pg_get_functiondef\(p\.oid\)/i);
assert.match(dialect.showProcedureSource("public", "demo_proc"), /"Create Procedure"/);
assert.match(dialect.showFunctionSource("public", "demo_fun"), /"Create Function"/);
assert.match(dialect.showTriggerSource("public", "demo_trigger"), /pg_get_triggerdef\(t\.oid\)/i);
assert.match(dialect.procedureTemplate(), /\$body\$/);
assert.match(dialect.functionTemplate(), /\$body\$/);

console.log("kingbaseRoutineDialect tests passed");
```

- [ ] **Step 2: Write Kingbase service registration test**

Create `test/kingbaseImportExportRegistration.test.js` using the same mock style as `test/kingbaseServiceIntegration.test.js`. Add mocks for new files, then assert:

```javascript
assert(ServiceManager.getImportService(DatabaseType.KINGBASE) instanceof KingbaseImportService);
assert(ServiceManager.getDumpService(DatabaseType.KINGBASE) instanceof KingbaseDumpService);
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node test/kingbaseRoutineDialect.test.js
node test/kingbaseImportExportRegistration.test.js
```

Expected: FAIL because overrides and services are missing.

- [ ] **Step 4: Implement Kingbase dialect overrides**

In `src/service/dialect/kingbaseDialect.ts`, keep the class extending `PostgreSqlDialect` and add overrides:

```typescript
showProcedures(database: string): string {
    return `SELECT p.proname "ROUTINE_NAME"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '${database}' AND p.prokind = 'p'
ORDER BY p.proname`;
}

showFunctions(database: string): string {
    return `SELECT p.proname "ROUTINE_NAME"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '${database}' AND p.prokind IN ('f','a','w')
ORDER BY p.proname`;
}

showProcedureSource(database: string, name: string): string {
    return `SELECT pg_get_functiondef(p.oid) "Create Procedure", p.proname "Procedure"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '${database}' AND p.proname = '${name}' AND p.prokind = 'p'
ORDER BY p.oid
LIMIT 1`;
}
```

Add equivalent `showFunctionSource`, `showTriggerSource`, `procedureTemplate`, `functionTemplate`, and `triggerTemplate`.

- [ ] **Step 5: Implement import/export services**

Create `src/service/import/kingbaseImportService.ts`:

```typescript
import { Node } from "@/model/interface/node";
import { ConnectionManager } from "../connectionManager";
import { QueryUnit } from "../queryUnit";
import { ImportService } from "./importService";
import { parseSqlScriptBatches } from "./sqlScriptBatchParser";
import { readFileSync } from "fs";
import * as vscode from "vscode";
import { Util } from "@/common/util";

export class KingbaseImportService extends ImportService {
    public importSql(importPath: string, node: Node): void {
        const sql = readFileSync(importPath, "utf8");
        const batches = parseSqlScriptBatches(sql, "kingbase");
        Util.process(vscode.l10n.t(`Importing sql file {0}`, importPath), async (done) => {
            const sessionId = `kingbase_import_${new Date().getTime()}`;
            try {
                const connection = await ConnectionManager.getConnection(node, { sessionId });
                await QueryUnit.runBatch(connection, batches);
                vscode.window.showInformationMessage(`Import sql file ${importPath} success!`);
            } finally {
                ConnectionManager.removeConnection(sessionId);
                done();
            }
        });
    }
}
```

Create `src/service/dump/kingbaseDumpService.ts`:

```typescript
import { createKingbaseDumpProfile } from "./sqlScriptDumpProfile";
import { SqlScriptDumpService } from "./sqlScriptDumpService";

export class KingbaseDumpService extends SqlScriptDumpService {
    constructor() {
        super(createKingbaseDumpProfile());
    }
}
```

- [ ] **Step 6: Register services**

In `src/service/serviceManager.ts`:

- import `KingbaseImportService`.
- import `KingbaseDumpService`.
- return `KingbaseDumpService` from `getDumpService(DatabaseType.KINGBASE)`.
- return `KingbaseImportService` from `getImportService(DatabaseType.KINGBASE)`.

- [ ] **Step 7: Run focused Kingbase tests**

Run:

```bash
node test/kingbaseRoutineDialect.test.js
node test/kingbaseImportExportRegistration.test.js
node test/kingbaseDialect.test.js
node test/kingbaseConnection.test.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/service/dialect/kingbaseDialect.ts src/service/import/kingbaseImportService.ts src/service/dump/kingbaseDumpService.ts src/service/serviceManager.ts test/kingbaseRoutineDialect.test.js test/kingbaseImportExportRegistration.test.js
git commit -m "feat: add kingbase import export routines"
```

---

### Task 4: Dameng Dependency, Result Adapter, And Connection

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/service/connect/damengResultAdapter.ts`
- Create: `src/service/connect/damengConnection.ts`
- Test: `test/damengResultAdapter.test.js`
- Test: `test/damengConnection.test.js`

**Interfaces:**
- Produces:
  - `adaptDamengResult(result: DamengExecuteResult): AdaptedDamengResult`
  - `DamengConnection extends IConnection`

- [ ] **Step 1: Install dependency**

Run:

```bash
npm install dmdb@1.0.49630 --save
```

Expected: `package.json` and `package-lock.json` include `dmdb`.

- [ ] **Step 2: Write Dameng result adapter test**

Create `test/damengResultAdapter.test.js`:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { adaptDamengResult } = requireTs("src/service/connect/damengResultAdapter.ts");

const selectResult = adaptDamengResult({
  rows: [{ ID: 1, NAME: "AirDB" }],
  metaData: [{ name: "ID", precision: 10 }, { name: "NAME", precision: 100 }],
});

assert.deepStrictEqual(selectResult.results, [{ ID: 1, NAME: "AirDB" }]);
assert.deepStrictEqual(selectResult.fields.map((field) => field.name), ["ID", "NAME"]);
assert.deepStrictEqual(adaptDamengResult({ rowsAffected: 2 }).results, { affectedRows: 2 });

console.log("damengResultAdapter tests passed");
```

- [ ] **Step 3: Write Dameng connection test**

Create `test/damengConnection.test.js` with a fake driver injected into the constructor. Assert:

- default port is `5236`.
- `connect()` calls fake `getConnection`.
- callback query returns rows and fields.
- DML returns `{ affectedRows }`.
- event query emits `result` and `end`.
- callback query errors do not create an uncaught exception.
- `beginTransaction`, `rollback`, `commit`, and `end` call the expected fake connection methods.

- [ ] **Step 4: Run tests to verify they fail**

Run:

```bash
node test/damengResultAdapter.test.js
node test/damengConnection.test.js
```

Expected: FAIL because Dameng files do not exist.

- [ ] **Step 5: Implement result adapter**

Create `src/service/connect/damengResultAdapter.ts` mirroring `oracleResultAdapter.ts`, but accept Dameng metadata fields such as `name`, `columnName`, `precision`, and `dbTypeName`.

- [ ] **Step 6: Implement connection**

Create `src/service/connect/damengConnection.ts`:

```typescript
import { EventEmitter } from "events";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";
import { adaptDamengResult } from "./damengResultAdapter";

const dmdb = require("dmdb");

export class DamengConnection extends IConnection {
    private connection: any;
    private inTransaction = false;
    private readonly config: any;

    constructor(node: Node, private readonly driver: any = dmdb) {
        super();
        this.config = {
            host: node.host,
            port: node.port || 5236,
            user: node.user,
            password: node.password,
        };
    }
}
```

Complete the methods using the Oracle connection shape, with Dameng-specific `execute` options and safe callback/event error behavior.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node test/damengResultAdapter.test.js
node test/damengConnection.test.js
```

Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/service/connect/damengResultAdapter.ts src/service/connect/damengConnection.ts test/damengResultAdapter.test.js test/damengConnection.test.js
git commit -m "feat: add dameng connection"
```

---

### Task 5: Dameng Dialect And Pagination

**Files:**
- Create: `src/service/dialect/damengDialect.ts`
- Create: `src/service/page/damengPageService.ts`
- Test: `test/damengDialect.test.js`
- Test: `test/damengPageService.test.js`

**Interfaces:**
- Produces: `DamengDialect extends SqlDialect`
- Produces: `DamengPageService extends AbstractPageSerivce`

- [ ] **Step 1: Write dialect test**

Create `test/damengDialect.test.js`:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DamengDialect } = requireTs("src/service/dialect/damengDialect.ts");

const dialect = new DamengDialect();

assert.match(dialect.showSchemas(), /ALL_USERS|SYSOBJECTS|INFORMATION_SCHEMA/i);
assert.match(dialect.showTables("SYSDBA"), /"name"/);
assert.match(dialect.showViews("SYSDBA"), /"name"/);
assert.match(dialect.showColumns("SYSDBA", "DEMO"), /"simpleType"/);
assert.match(dialect.showProcedures("SYSDBA"), /"ROUTINE_NAME"/);
assert.match(dialect.showFunctions("SYSDBA"), /"ROUTINE_NAME"/);
assert.match(dialect.showTriggers("SYSDBA"), /"TRIGGER_NAME"/);
assert.match(dialect.showProcedureSource("SYSDBA", "P_DEMO"), /"Create Procedure"/);
assert.match(dialect.showFunctionSource("SYSDBA", "F_DEMO"), /"Create Function"/);
assert.match(dialect.showTriggerSource("SYSDBA", "T_DEMO"), /"SQL Original Statement"/);
assert.strictEqual(dialect.buildPageSql("SYSDBA", "DEMO", 20), "SELECT * FROM SYSDBA.DEMO OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY");
assert.strictEqual(dialect.countSql("SYSDBA", "DEMO"), "SELECT count(*) \"count\" FROM SYSDBA.DEMO");
assert.match(dialect.procedureTemplate(), /CREATE OR REPLACE PROCEDURE/);
assert.match(dialect.procedureTemplate(), /\n\//);

console.log("damengDialect tests passed");
```

- [ ] **Step 2: Write page service test**

Create `test/damengPageService.test.js`:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DamengPageService } = requireTs("src/service/page/damengPageService.ts");

const service = new DamengPageService();

assert.strictEqual(
  service.buildPageSql("SELECT * FROM DEMO", 20, 10),
  "SELECT * FROM DEMO OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY"
);
assert.strictEqual(
  service.buildPageSql("SELECT * FROM DEMO OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY", 10, 10),
  "SELECT * FROM DEMO OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY"
);

console.log("damengPageService tests passed");
```

If `buildPageSql` is protected like other services, expose it through a test subclass in the test file.

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node test/damengDialect.test.js
node test/damengPageService.test.js
```

Expected: FAIL because files do not exist.

- [ ] **Step 4: Implement Dameng dialect**

Create `src/service/dialect/damengDialect.ts` with Oracle-style metadata and source aliases. Keep helper methods private:

- `normalizeIdentifier(identifier: string): string`
- `quoteLiteral(value: string): string`
- `qualified(schema: string, objectName: string): string`
- `sourceByMetadata(objectType: string, schema: string, name: string, alias: string): string`

Use returned column aliases matching existing nodes.

- [ ] **Step 5: Implement Dameng page service**

Create `src/service/page/damengPageService.ts` equivalent to `OraclePageService`, but exported as `DamengPageService`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
node test/damengDialect.test.js
node test/damengPageService.test.js
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/service/dialect/damengDialect.ts src/service/page/damengPageService.ts test/damengDialect.test.js test/damengPageService.test.js
git commit -m "feat: add dameng dialect"
```

---

### Task 6: Dameng Registration, UI, Tree, Import, And Export

**Files:**
- Modify: `src/common/constants.ts`
- Modify: `src/service/connectionManager.ts`
- Modify: `src/service/serviceManager.ts`
- Create: `src/service/import/damengImportService.ts`
- Create: `src/service/dump/damengDumpService.ts`
- Modify: `src/model/database/connectionNode.ts`
- Modify: `src/model/database/schemaNode.ts`
- Modify: `src/model/main/tableGroup.ts`
- Modify: `src/provider/treeDataProvider.ts`
- Modify: `src/vue/connect/index.vue`
- Test: `test/damengServiceIntegration.test.js`
- Test: `test/damengUiConfig.test.js`

**Interfaces:**
- Consumes: `DamengConnection`, `DamengDialect`, `DamengPageService`, parser, dump profile.
- Produces: visible `"Dameng"` database option and service registration.

- [ ] **Step 1: Write service integration test**

Create `test/damengServiceIntegration.test.js` by copying the mock approach from `test/kingbaseServiceIntegration.test.js`. Include mocks for `damengConnection`, `damengDialect`, `damengPageService`, `damengImportService`, and `damengDumpService`. Assert:

```javascript
assert.strictEqual(DatabaseType.DAMENG, "Dameng");
assert(ServiceManager.getDialect(DatabaseType.DAMENG) instanceof DamengDialect);
assert(ServiceManager.getPageService(DatabaseType.DAMENG) instanceof DamengPageService);
assert(ServiceManager.getImportService(DatabaseType.DAMENG) instanceof DamengImportService);
assert(ServiceManager.getDumpService(DatabaseType.DAMENG) instanceof DamengDumpService);
```

- [ ] **Step 2: Write UI config test**

Create `test/damengUiConfig.test.js`:

```javascript
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { root } = require("./testSetup");

const source = fs.readFileSync(path.resolve(root, "src/vue/connect/index.vue"), "utf8");

assert.match(source, /Dameng:\s*\{\s*text:\s*"DM"/);
assert.match(source, /supportDatabases:\s*\[[\s\S]*"KingbaseES",\s*"Dameng"/);
assert.match(source, /\['MySQL', 'PostgreSQL', 'KingbaseES', 'Dameng', 'MongoDB', 'Redis', 'ElasticSearch'\]/);
assert.match(source, /case "Dameng":[\s\S]*this\.connectionOption\.user = "SYSDBA";[\s\S]*this\.connectionOption\.encrypt = false;[\s\S]*this\.connectionOption\.port = 5236;[\s\S]*this\.connectionOption\.database = "SYSDBA";/);

console.log("damengUiConfig tests passed");
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node test/damengServiceIntegration.test.js
node test/damengUiConfig.test.js
```

Expected: FAIL because Dameng is not registered.

- [ ] **Step 4: Implement import/export services**

Create `src/service/import/damengImportService.ts` equivalent to `KingbaseImportService`, but call `parseSqlScriptBatches(sql, "dameng")`.

Create `src/service/dump/damengDumpService.ts`:

```typescript
import { createDamengDumpProfile } from "./sqlScriptDumpProfile";
import { SqlScriptDumpService } from "./sqlScriptDumpService";

export class DamengDumpService extends SqlScriptDumpService {
    constructor() {
        super(createDamengDumpProfile());
    }
}
```

- [ ] **Step 5: Register TypeScript services**

Make these concrete changes:

- `DatabaseType.DAMENG = "Dameng"` in `src/common/constants.ts`.
- import and return `DamengConnection` in `ConnectionManager.create`.
- import and return `DamengDialect`, `DamengPageService`, `DamengImportService`, and `DamengDumpService` in `ServiceManager`.
- include Dameng in schema-style tree branches where Oracle is handled.
- include Dameng in active schema switching where Oracle/PG/MSSQL/Kingbase are handled.

- [ ] **Step 6: Register connection UI**

In `src/vue/connect/index.vue`:

- add `Dameng` logo metadata with `text: "DM"`.
- add `"Dameng"` after `"KingbaseES"` in `supportDatabases`.
- include `Dameng` in the SSL component visibility list only if the form supports the same SSL fields for it. If SSL is not wired in the driver yet, leave it out of SSL visibility.
- add `case "Dameng"` defaults:

```javascript
case "Dameng":
  this.connectionOption.user = "SYSDBA";
  this.connectionOption.encrypt = false;
  this.connectionOption.port = 5236;
  this.connectionOption.database = "SYSDBA";
  break;
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node test/damengServiceIntegration.test.js
node test/damengUiConfig.test.js
node test/sqlScriptBatchParser.test.js
node test/sqlScriptDumpProfile.test.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/common/constants.ts src/service/connectionManager.ts src/service/serviceManager.ts src/service/import/damengImportService.ts src/service/dump/damengDumpService.ts src/model/database/connectionNode.ts src/model/database/schemaNode.ts src/model/main/tableGroup.ts src/provider/treeDataProvider.ts src/vue/connect/index.vue test/damengServiceIntegration.test.js test/damengUiConfig.test.js
git commit -m "feat: register dameng database support"
```

---

### Task 7: Routine Source Display Fallbacks

**Files:**
- Modify: `src/model/main/procedure.ts`
- Modify: `src/model/main/function.ts`
- Modify: `src/model/main/trigger.ts`
- Test: add assertions to `test/kingbaseRoutineDialect.test.js` and `test/damengDialect.test.js`

**Interfaces:**
- Consumes: existing source columns and optional `CREATE_SQL`.
- Produces: safer source display when dialects return normalized source.

- [ ] **Step 1: Add tests for source aliases**

Update dialect tests to assert source SQL includes both legacy aliases and `CREATE_SQL`:

```javascript
assert.match(dialect.showProcedureSource("SYSDBA", "P_DEMO"), /CREATE_SQL/);
assert.match(dialect.showTriggerSource("SYSDBA", "T_DEMO"), /CREATE_SQL/);
```

Add similar Kingbase assertions.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node test/kingbaseRoutineDialect.test.js
node test/damengDialect.test.js
```

Expected: FAIL until dialect source SQL includes `CREATE_SQL`.

- [ ] **Step 3: Add source fallback helpers in nodes**

In each node, resolve source as:

```typescript
const source = procedDtail['Create Procedure'] || procedDtail.CREATE_SQL;
if (!source) {
    vscode.window.showErrorMessage(vscode.l10n.t("Routine source is empty."));
    return;
}
```

Use the corresponding legacy field for function and trigger.

- [ ] **Step 4: Update dialect source SQL aliases**

For Kingbase and Dameng source queries, return both:

- legacy alias required by existing code.
- `CREATE_SQL` alias for new fallback.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node test/kingbaseRoutineDialect.test.js
node test/damengDialect.test.js
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/model/main/procedure.ts src/model/main/function.ts src/model/main/trigger.ts src/service/dialect/kingbaseDialect.ts src/service/dialect/damengDialect.ts test/kingbaseRoutineDialect.test.js test/damengDialect.test.js
git commit -m "fix: normalize routine source display"
```

---

### Task 8: Verification And Regression

**Files:**
- No required source files unless tests reveal defects.

**Interfaces:**
- Consumes all prior tasks.
- Produces buildable extension with focused test coverage.

- [ ] **Step 1: Run focused Dameng tests**

Run:

```bash
node test/damengResultAdapter.test.js
node test/damengConnection.test.js
node test/damengDialect.test.js
node test/damengPageService.test.js
node test/damengServiceIntegration.test.js
node test/damengUiConfig.test.js
```

Expected: all pass.

- [ ] **Step 2: Run focused Kingbase tests**

Run:

```bash
node test/kingbaseDriverLoader.test.js
node test/kingbaseConnection.test.js
node test/kingbaseDialect.test.js
node test/kingbaseRoutineDialect.test.js
node test/kingbaseServiceIntegration.test.js
node test/kingbaseUiConfig.test.js
node test/kingbaseImportExportRegistration.test.js
```

Expected: all pass.

- [ ] **Step 3: Run shared import/export tests**

Run:

```bash
node test/sqlScriptBatchParser.test.js
node test/sqlScriptDumpProfile.test.js
```

Expected: all pass.

- [ ] **Step 4: Run existing regressions**

Run:

```bash
node test/oracleDialect.test.js
node test/oracleResultAdapter.test.js
node test/oraclePageService.test.js
node test/tableFilterSql.test.js
```

Expected: all pass.

- [ ] **Step 5: Build**

Run:

```bash
npm run build
```

Expected: build succeeds. Existing warnings about MongoDB dynamic require, `supports-color`, and webview bundle size may remain.

- [ ] **Step 6: Check package inclusion**

Run:

```powershell
Test-Path resources\drivers\kingbase\node_modules\kb\package.json
Select-String -Path .vscodeignore -Pattern 'resources|node_modules'
```

Expected:

- Kingbase package path prints `True`.
- `.vscodeignore` excludes root `node_modules/` but does not exclude `resources/`.

- [ ] **Step 7: Check git status**

Run:

```bash
git status --short --branch
```

Expected: no uncommitted source/test changes.

- [ ] **Step 8: Commit fixes if verification found defects**

If any verification fix was required, make the fix in the failing task's files, re-run the failed command, then commit the exact files touched by that fix. For example, a Dameng dialect verification fix would use:

```bash
git add src/service/dialect/damengDialect.ts test/damengDialect.test.js
git commit -m "fix: stabilize dameng kingbase verification"
```

If no fixes were required, do not create an empty commit.

---

## Manual Release Checklist

Run these against real servers before publishing:

- KingbaseES connection with host/user/password/database/port `54321`.
- KingbaseES expand catalog/schema/table/view/procedure/function/trigger.
- KingbaseES `SELECT 1`.
- KingbaseES import dollar-quoted procedure script.
- KingbaseES export schema-only and schema-with-data, then re-import.
- Dameng connection with host/user/password/port `5236`.
- Dameng expand schema/table/view/procedure/function/trigger.
- Dameng `SELECT 1`.
- Dameng table pagination.
- Dameng import slash-terminated procedure script.
- Dameng export schema-only and schema-with-data, then re-import.
- SSH tunnel path for both database types.

## Self-Review

- Spec coverage: all spec requirements map to tasks: shared parser Task 1, dump profiles Task 2, Kingbase parity Task 3, Dameng driver Task 4, Dameng dialect/page Task 5, registration/UI/tree Task 6, routine display Task 7, verification Task 8.
- Marker scan: no task uses unresolved marker text or unresolved file names.
- Type consistency: `parseSqlScriptBatches`, `SqlScriptDumpProfile`, `KingbaseImportService`, `DamengImportService`, `KingbaseDumpService`, `DamengDumpService`, `adaptDamengResult`, `DamengConnection`, `DamengDialect`, and `DamengPageService` are named consistently across tasks.

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-07-10-dameng-kingbase-import-export-procedures.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
