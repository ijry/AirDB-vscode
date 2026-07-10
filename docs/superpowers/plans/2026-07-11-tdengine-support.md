# TDengine Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TDengine as a first-class SQL backend using the official WebSocket connector, without requiring a native TDengine client on the user machine.

**Architecture:** TDengine is registered as a normal SQL database type and uses the existing SQL tree, query workspace, page service, and generic SQL import/export surface. A new `TDengineConnection` adapts `@tdengine/websocket` result shapes into AirDB's `IConnection` contract, while `TDengineDialect` owns TDengine metadata SQL and templates. UI changes stay in the existing connection form with a TDengine logo and defaults.

**Tech Stack:** TypeScript, VS Code extension host, Vue 2 connection webview, webpack 4, Node.js package `@tdengine/websocket`, existing Node-based tests under `test/`.

## Global Constraints

- Use official `@tdengine/websocket` package version range `^3.5.0`.
- Do not depend on native TDengine client bindings.
- Connect through taosAdapter WebSocket with default host `127.0.0.1`, port `6041`, user `root`, password `taosdata`, empty database, SSL disabled, connect timeout `5000`, and request timeout `10000`.
- Keep TDengine in SQL storage and SQL tree paths, not NoSQL.
- First version does not add dedicated supertable/subtable UI, streams/topics/subscriptions, schemaless write, enterprise admin, or live integration tests.
- Use focused tests that mock the TDengine driver and do not require a running TDengine server.
- Do not stage unrelated existing dirty files such as `docs/superpowers/plans/2026-07-11-doris-support.md`.

---

## File Structure

- `package.json`: add `@tdengine/websocket` dependency.
- `webpack.config.js`: externalize `@tdengine/websocket` if webpack cannot bundle it cleanly.
- `.vscodeignore`: include externalized TDengine runtime package and its runtime dependencies.
- `resources/icon/tdengine.svg`: TDengine SVG logo used by tree and connection UI.
- `src/common/constants.ts`: add `DatabaseType.TDENGINE = "TDengine"`.
- `src/service/connect/tdengineConnection.ts`: new `IConnection` adapter around `@tdengine/websocket`.
- `src/service/connectionManager.ts`: route `DatabaseType.TDENGINE` to `TDengineConnection`.
- `src/service/dialect/tdengineDialect.ts`: TDengine metadata SQL, templates, quoting, and ping database behavior.
- `src/service/serviceManager.ts`: route dialect, page service, import service, and dump service.
- `src/model/database/connectionNode.ts`: SQL tree icon and no-catalog behavior.
- `src/model/database/schemaNode.ts`: database icon and drop target behavior.
- `src/model/main/tableGroup.ts`: table filter and pinned-table state keys.
- `src/model/main/tableNode.ts`: source display path for `SHOW CREATE TABLE`.
- `src/provider/treeDataProvider.ts`: keep TDengine out of NoSQL routing.
- `src/vue/connect/index.vue`: connection tab, logo, SSL switch, defaults.
- `test/tdengineRegistration.test.js`: static registration, packaging, tree routing, icon checks.
- `test/tdengineConnection.test.js`: mocked connector adapter behavior.
- `test/tdengineDialect.test.js`: dialect SQL and escaping checks.
- `test/tdengineServiceIntegration.test.js`: service manager routing checks.
- `test/tdengineUiConfig.test.js`: Vue config/default/logo checks.

---

### Task 1: Dependency and Registration Tests

**Files:**
- Modify: `package.json`
- Modify: `webpack.config.js`
- Modify: `.vscodeignore`
- Modify: `src/common/constants.ts`
- Create: `test/tdengineRegistration.test.js`

**Interfaces:**
- Produces: `DatabaseType.TDENGINE` string enum value `"TDengine"`.
- Produces: packaging contract that exposes `@tdengine/websocket` at runtime.

- [ ] **Step 1: Write the failing registration test**

Create `test/tdengineRegistration.test.js` with these assertions:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const constants = read("src/common/constants.ts");
assert.match(constants, /TDENGINE\s*=\s*"TDengine"/);

const pkg = JSON.parse(read("package.json"));
assert.strictEqual(pkg.dependencies["@tdengine/websocket"], "^3.5.0");

const webpackConfig = read("webpack.config.js");
assert.match(webpackConfig, /'@tdengine\/websocket':\s*'commonjs @tdengine\/websocket'/);

const vscodeIgnore = read(".vscodeignore");
assert.match(vscodeIgnore, /!node_modules\/@tdengine\//);
assert.match(vscodeIgnore, /!node_modules\/@tdengine\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/async-mutex\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/json-bigint\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/moment-timezone\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/uuid\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/websocket\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/winston\/\*\*/);
assert.match(vscodeIgnore, /!node_modules\/winston-daily-rotate-file\/\*\*/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /TDengineConnection/);
assert.match(connectionManager, /case DatabaseType\.TDENGINE:[\s\S]*new TDengineConnection/);

const treeProvider = read("src/provider/treeDataProvider.ts");
const getKeyBlock = treeProvider.match(/private getKeyByNode[\s\S]*?return CacheKey\.DATBASE_CONECTIONS;/)[0];
assert.doesNotMatch(getKeyBlock, /DatabaseType\.TDENGINE/);

const connectionNode = read("src/model/database/connectionNode.ts");
assert.match(connectionNode, /icon\/tdengine\.svg/);
assert.match(connectionNode, /this\.dbType == DatabaseType\.TDENGINE[\s\S]*this\.iconPath/);
assert.match(connectionNode, /this\.dbType != DatabaseType\.TDENGINE[\s\S]*this\.contextValue == ModelType\.CONNECTION/);
assert.match(connectionNode, /DatabaseType\.TDENGINE\)[\s\S]*\? databaseNode\.schema[\s\S]*: databaseNode\.database/);

console.log("tdengineRegistration tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node -r ./test/testSetup.js test/tdengineRegistration.test.js`

Expected: FAIL because `DatabaseType.TDENGINE`, package dependency, connection routing, and icon registrations do not exist yet.

- [ ] **Step 3: Add dependency and enum**

Update `package.json` dependencies:

```json
"@tdengine/websocket": "^3.5.0"
```

Update `src/common/constants.ts` enum:

```ts
CLICKHOUSE = "ClickHouse", DORIS = "Doris", TDENGINE = "TDengine", DUCKDB = "DuckDB",
```

- [ ] **Step 4: Externalize runtime dependency**

Update `webpack.config.js` extension externals:

```js
'@tdengine/websocket': 'commonjs @tdengine/websocket',
```

Update `.vscodeignore` near the other package whitelists:

```text
!node_modules/@tdengine/
!node_modules/@tdengine/**
!node_modules/async-mutex/**
!node_modules/winston-daily-rotate-file/**
```

Keep existing whitelists for `json-bigint`, `moment-timezone`, `uuid`, `websocket`, and `winston`.

- [ ] **Step 5: Install dependency**

Run: `npm install @tdengine/websocket@^3.5.0`

Expected: `package.json` is updated and the package is present in `node_modules`. If `package-lock.json` is not tracked, do not stage it.

- [ ] **Step 6: Commit task**

Run:

```bash
git add package.json webpack.config.js .vscodeignore src/common/constants.ts test/tdengineRegistration.test.js
git commit -m "feat: register tdengine backend"
```

Expected: commit contains only registration, dependency, and test changes.

---

### Task 2: TDengine Connection Adapter

**Files:**
- Create: `src/service/connect/tdengineConnection.ts`
- Modify: `src/service/connectionManager.ts`
- Create: `test/tdengineConnection.test.js`

**Interfaces:**
- Consumes: `DatabaseType.TDENGINE`.
- Produces: `TDengineConnection.normalizeNode(node: Node | any): any`.
- Produces: `createTDengineConfig(node: Node | any): any`.
- Produces: `TDengineConnection` implementing `IConnection`.

- [ ] **Step 1: Write the failing connection test**

Create `test/tdengineConnection.test.js` with mocked driver behavior:

```js
const assert = require("assert");
const { EventEmitter } = require("events");
require("./testSetup");

const {
  TDengineConnection,
  createTDengineConfig,
} = require("../src/service/connect/tdengineConnection");

class FakeClient {
  constructor(config) {
    this.config = config;
    this.closed = false;
    this.calls = [];
  }

  async query(sql) {
    this.calls.push(sql);
    if (/select rows/i.test(sql)) {
      return [{ ts: "2026-07-11 00:00:00.000", value: 42 }];
    }
    if (/affected/i.test(sql)) {
      return { affectedRows: 3 };
    }
    return [];
  }

  async close() {
    this.closed = true;
  }
}

async function queryPromise(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.query(sql, (err, rows, fields) => {
      if (err) reject(err);
      else resolve({ rows, fields });
    });
  });
}

async function connectPromise(connection) {
  return new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()));
  });
}

(async () => {
  const config = createTDengineConfig({ host: "", port: null, user: "", password: "", database: "", useSSL: false });
  assert.strictEqual(config.url, "ws://127.0.0.1:6041");
  assert.strictEqual(config.user, "root");
  assert.strictEqual(config.password, "taosdata");
  assert.strictEqual(config.database, "");
  assert.strictEqual(config.connectTimeout, 5000);
  assert.strictEqual(config.requestTimeout, 10000);

  let receivedConfig;
  const connection = new TDengineConnection(
    { host: "td.local", port: 6041, user: "root", password: "secret", database: "meters", useSSL: true },
    (clientConfig) => {
      receivedConfig = clientConfig;
      return new FakeClient(clientConfig);
    }
  );

  await connectPromise(connection);
  assert.strictEqual(receivedConfig.url, "wss://td.local:6041");
  assert.strictEqual(connection.isAlive(), true);

  const select = await queryPromise(connection, "select rows");
  assert.deepStrictEqual(select.rows, [{ ts: "2026-07-11 00:00:00.000", value: 42 }]);
  assert.deepStrictEqual(select.fields, [{ name: "ts", nullable: "YES" }, { name: "value", nullable: "YES" }]);

  const affected = await queryPromise(connection, "affected");
  assert.deepStrictEqual(affected.rows, { affectedRows: 3 });

  const events = [];
  await new Promise((resolve, reject) => {
    const emitter = connection.query("select rows");
    assert.ok(emitter instanceof EventEmitter);
    emitter.on("result", (row, last) => events.push({ row, last }));
    emitter.on("error", reject);
    setTimeout(resolve, 20);
  });
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].last, true);

  connection.beginTransaction((err) => assert.strictEqual(err, null));
  connection.rollback();
  connection.commit();
  connection.end();
  assert.strictEqual(connection.isAlive(), false);
  assert.strictEqual(connection.client.closed, true);

  console.log("tdengineConnection tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node -r ./test/testSetup.js test/tdengineConnection.test.js`

Expected: FAIL because `src/service/connect/tdengineConnection.ts` does not exist.

- [ ] **Step 3: Implement `TDengineConnection`**

Create `src/service/connect/tdengineConnection.ts` with:

```ts
import { Node } from "@/model/interface/node";
import { EventEmitter } from "events";
import { IConnection, queryCallback } from "./connection";

type TDengineClientFactory = (config: any) => any;

function createDefaultTDengineClient(config: any): any {
    const tdengine = require("@tdengine/websocket");
    if (tdengine.connect instanceof Function) {
        return tdengine.connect(config);
    }
    if (tdengine.sql && tdengine.sql.connect instanceof Function) {
        return tdengine.sql.connect(config);
    }
    if (tdengine.TDWebSocketClient instanceof Function) {
        return new tdengine.TDWebSocketClient(config);
    }
    throw new Error("@tdengine/websocket does not expose a supported connect API.");
}

function buildTDengineUrl(node: Node | any): string {
    if (node.connectionUrl) return node.connectionUrl;
    const protocol = node.useSSL ? "wss" : "ws";
    const host = node.host || "127.0.0.1";
    const port = node.port || 6041;
    return `${protocol}://${host}:${port}`;
}

export function createTDengineConfig(node: Node | any): any {
    const normalized = TDengineConnection.normalizeNode(node);
    return {
        url: buildTDengineUrl(normalized),
        host: normalized.host,
        port: normalized.port,
        user: normalized.user,
        username: normalized.user,
        password: normalized.password,
        database: normalized.database || "",
        db: normalized.database || "",
        connectTimeout: normalized.connectTimeout,
        requestTimeout: normalized.requestTimeout,
        timeout: normalized.requestTimeout,
    };
}

function fieldsFromRows(rows: any[]): any[] {
    const first = rows && rows[0];
    if (!first) return [];
    return Object.keys(first).map((name) => ({ name, nullable: "YES" }));
}

function rowsFromResult(result: any): any[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.rows)) return result.rows;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.result)) return result.result;
    return [];
}

function affectedFromResult(result: any): any {
    const affectedRows = result?.affectedRows ?? result?.affected ?? result?.rowsAffected ?? 0;
    return { affectedRows };
}

export class TDengineConnection extends IConnection {
    public client: any;
    private connected = false;

    constructor(private node: Node, private clientFactory: TDengineClientFactory = createDefaultTDengineClient) {
        super();
    }

    public static normalizeNode(node: Node | any): any {
        return {
            ...node,
            host: node.host || "127.0.0.1",
            port: node.port || 6041,
            user: node.user || "root",
            password: node.password || "taosdata",
            database: node.database || "",
            useSSL: node.useSSL == null ? false : node.useSSL,
            connectTimeout: parseInt(node.connectTimeout || 5000),
            requestTimeout: parseInt(node.requestTimeout || 10000),
        };
    }

    query(sql: string, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): void | EventEmitter;
    query(sql: string, values?: any, callback?: any): void | EventEmitter {
        if (!callback && values instanceof Function) {
            callback = values;
        }

        const event = new EventEmitter();
        this.runQuery(sql).then((result) => {
            const rows = rowsFromResult(result);
            if (!callback) {
                if (rows.length === 0) {
                    event.emit("end");
                    return;
                }
                rows.forEach((row, index) => event.emit("result", this.convertToDump(row), rows.length === index + 1));
                return;
            }
            callback(null, rows.length > 0 ? rows : affectedFromResult(result), fieldsFromRows(rows));
        }).catch((error) => {
            if (callback) callback(error);
            event.emit("error", error.message || String(error));
        });
        return callback ? undefined : event;
    }

    private async runQuery(sql: string): Promise<any> {
        if (!this.client) {
            this.client = await Promise.resolve(this.clientFactory(createTDengineConfig(this.node)));
        }
        if (this.client.query instanceof Function) {
            return this.client.query(sql);
        }
        if (this.client.execute instanceof Function) {
            return this.client.execute(sql);
        }
        throw new Error("TDengine client does not expose query or execute.");
    }

    connect(callback: (err: Error) => void): void {
        Promise.resolve()
            .then(async () => {
                this.client = await Promise.resolve(this.clientFactory(createTDengineConfig(this.node)));
                await this.runQuery("SELECT 1");
                this.connected = true;
                callback(null);
            })
            .catch((error) => callback(error));
    }

    beginTransaction(callback: (err: Error) => void): void {
        callback(null);
    }

    rollback(): void {
    }

    commit(): void {
    }

    end(): void {
        this.dead = true;
        this.connected = false;
        try {
            if (this.client?.close instanceof Function) {
                this.client.close();
            }
        } catch (_error) {
        }
    }

    isAlive(): boolean {
        return !this.dead && this.connected;
    }
}
```

After installing the package, inspect the actual `@tdengine/websocket` exports and adjust only `createDefaultTDengineClient` if the official API differs.

- [ ] **Step 4: Route connection manager**

Update `src/service/connectionManager.ts`:

```ts
import { TDengineConnection } from "./connect/tdengineConnection";
```

Add switch case:

```ts
case DatabaseType.TDENGINE:
    return new TDengineConnection(opt);
```

- [ ] **Step 5: Run focused test**

Run: `node -r ./test/testSetup.js test/tdengineConnection.test.js`

Expected: PASS.

- [ ] **Step 6: Commit task**

Run:

```bash
git add src/service/connect/tdengineConnection.ts src/service/connectionManager.ts test/tdengineConnection.test.js
git commit -m "feat: add tdengine connection adapter"
```

Expected: commit contains connection adapter and tests.

---

### Task 3: TDengine Dialect and Service Routing

**Files:**
- Create: `src/service/dialect/tdengineDialect.ts`
- Modify: `src/service/serviceManager.ts`
- Modify: `src/model/main/tableNode.ts`
- Create: `test/tdengineDialect.test.js`
- Create: `test/tdengineServiceIntegration.test.js`

**Interfaces:**
- Consumes: `DatabaseType.TDENGINE`.
- Produces: `TDengineDialect` class extending `SqlDialect`.
- Produces: service routes for dialect, page service, generic import service, and generic dump service.

- [ ] **Step 1: Write failing dialect test**

Create `test/tdengineDialect.test.js`:

```js
const assert = require("assert");
require("./testSetup");

const { TDengineDialect } = require("../src/service/dialect/tdengineDialect");

const dialect = new TDengineDialect();

assert.strictEqual(dialect.pingDataBase("meters"), "USE `meters`");
assert.strictEqual(dialect.pingDataBase(""), "SELECT 1");
assert.strictEqual(dialect.showSchemas(), "SHOW DATABASES");
assert.strictEqual(dialect.showDatabases(), "SHOW DATABASES");
assert.match(dialect.showTables("meters"), /information_schema\.ins_tables/i);
assert.match(dialect.showTables("meters"), /db_name = 'meters'/);
assert.match(dialect.showColumns("meters", "d1001"), /DESCRIBE `meters`\.`d1001`/);
assert.strictEqual(dialect.buildPageSql("meters", "d1001", 100), "SELECT * FROM `meters`.`d1001` LIMIT 100;");
assert.strictEqual(dialect.countSql("meters", "d1001"), "SELECT COUNT(*) FROM `meters`.`d1001`;");
assert.strictEqual(dialect.createDatabase("my`db"), "CREATE DATABASE `my``db`");
assert.strictEqual(dialect.showTableSource("meters", "d1001"), "SHOW CREATE TABLE `meters`.`d1001`;");
assert.match(dialect.tableTemplate(), /CREATE TABLE \[name\]/);
assert.match(dialect.tableTemplate(), /ts TIMESTAMP/);
assert.strictEqual(dialect.showViews("meters"), "SELECT NULL AS name WHERE 1 = 0;");
assert.strictEqual(dialect.showProcedures("meters"), "SELECT NULL AS ROUTINE_NAME WHERE 1 = 0;");
assert.strictEqual(dialect.showFunctions("meters"), "SELECT NULL AS ROUTINE_NAME WHERE 1 = 0;");
assert.strictEqual(dialect.showTriggers("meters"), "SELECT NULL AS TRIGGER_NAME WHERE 1 = 0;");

console.log("tdengineDialect tests passed");
```

- [ ] **Step 2: Write failing service routing test**

Create `test/tdengineServiceIntegration.test.js` using existing `testSetup` stubs:

```js
const assert = require("assert");
require("./testSetup");

const { DatabaseType } = require("../src/common/constants");
const { ServiceManager } = require("../src/service/serviceManager");
const { TDengineDialect } = require("../src/service/dialect/tdengineDialect");
const { PostgreSqlPageService } = require("../src/service/page/postgreSqlPageService");
const { ImportService } = require("../src/service/import/importService");
const { DumpService } = require("../src/service/dump/dumpService");

assert.ok(ServiceManager.getDialect(DatabaseType.TDENGINE) instanceof TDengineDialect);
assert.ok(ServiceManager.getPageService(DatabaseType.TDENGINE) instanceof PostgreSqlPageService);
assert.ok(ServiceManager.getImportService(DatabaseType.TDENGINE) instanceof ImportService);
assert.ok(ServiceManager.getDumpService(DatabaseType.TDENGINE) instanceof DumpService);

console.log("tdengineServiceIntegration tests passed");
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
node -r ./test/testSetup.js test/tdengineDialect.test.js
node -r ./test/testSetup.js test/tdengineServiceIntegration.test.js
```

Expected: FAIL because `TDengineDialect` and routes do not exist.

- [ ] **Step 4: Implement dialect**

Create `src/service/dialect/tdengineDialect.ts`:

```ts
import { AddColumnParam } from "./param/addColumnParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class TDengineDialect extends SqlDialect {
    showDatabases(): string {
        return "SHOW DATABASES";
    }

    showSchemas(): string {
        return "SHOW DATABASES";
    }

    pingDataBase(database: string): string {
        if (!database) return "SELECT 1";
        return `USE ${this.quoteIdentifier(database)}`;
    }

    createDatabase(database: string): string {
        return `CREATE DATABASE ${this.quoteIdentifier(database)}`;
    }

    truncateDatabase(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT CONCAT('TRUNCATE TABLE \\\`', table_name, '\\\`;') trun
FROM information_schema.ins_tables
WHERE db_name = '${schema}'
ORDER BY table_name;`;
    }

    showTables(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT table_name AS name, comment AS comment, NULL AS rows
FROM information_schema.ins_tables
WHERE db_name = '${schema}'
ORDER BY table_name;`;
    }

    showColumns(database: string, table: string): string {
        return `DESCRIBE ${this.qualifiedName(database, table)};`;
    }

    showViews(database: string): string {
        return "SELECT NULL AS name WHERE 1 = 0;";
    }

    showUsers(): string {
        return "SHOW USERS;";
    }

    createUser(): string {
        return "CREATE USER username PASS 'password';";
    }

    showTriggers(database: string): string {
        return "SELECT NULL AS TRIGGER_NAME WHERE 1 = 0;";
    }

    showProcedures(database: string): string {
        return "SELECT NULL AS ROUTINE_NAME WHERE 1 = 0;";
    }

    showFunctions(database: string): string {
        return "SELECT NULL AS ROUTINE_NAME WHERE 1 = 0;";
    }

    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT * FROM ${this.qualifiedName(database, table)} LIMIT ${pageSize};`;
    }

    countSql(database: string, table: string): string {
        return `SELECT COUNT(*) FROM ${this.qualifiedName(database, table)};`;
    }

    updateTable(update: UpdateTableParam): string {
        const { table, newTableName } = update;
        if (newTableName && table != newTableName) {
            return `ALTER TABLE ${this.quoteIdentifier(table)} RENAME ${this.quoteIdentifier(newTableName)};`;
        }
        return "";
    }

    showTableSource(database: string, table: string): string {
        return `SHOW CREATE TABLE ${this.qualifiedName(database, table)};`;
    }

    showViewSource(database: string, table: string): string {
        return "";
    }

    showProcedureSource(database: string, name: string): string {
        return "";
    }

    showFunctionSource(database: string, name: string): string {
        return "";
    }

    showTriggerSource(database: string, name: string): string {
        return "";
    }

    addColumn(table: string): string {
        return `ALTER TABLE ${table} ADD COLUMN [column] [type];`;
    }

    addColumnSql(addColumnParam: AddColumnParam): string {
        return `ALTER TABLE ${addColumnParam.table} ADD COLUMN ${addColumnParam.columnName} ${addColumnParam.columnType};`;
    }

    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        return `ALTER TABLE ${table} MODIFY COLUMN ${column} ${type};`;
    }

    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        return `ALTER TABLE ${updateColumnParam.table} MODIFY COLUMN ${updateColumnParam.columnName} ${updateColumnParam.columnType};`;
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    ts TIMESTAMP,
    [column] DOUBLE
);`;
    }

    viewTemplate(): string {
        return "";
    }

    procedureTemplate(): string {
        return "";
    }

    triggerTemplate(): string {
        return "";
    }

    functionTemplate(): string {
        return "";
    }

    processList(): string {
        return "SHOW QUERIES;";
    }

    variableList(): string {
        return "SHOW VARIABLES;";
    }

    statusList(): string {
        return "SHOW DNODES;";
    }

    private qualifiedName(database: string, table: string): string {
        if (!database) return this.quoteIdentifier(table);
        return `${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)}`;
    }

    private quoteIdentifier(identifier: string): string {
        return `\`${String(identifier || "").replace(/`/g, "``")}\``;
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }
}
```

If build shows TDengine `DESCRIBE` result aliases do not match `ColumnNode`, add a result-normalization step in `TDengineConnection` after inspecting mocked and documented result shapes.

- [ ] **Step 5: Route services**

Update `src/service/serviceManager.ts` imports:

```ts
import { TDengineDialect } from "./dialect/tdengineDialect";
import { ImportService } from "./import/importService";
```

Update routes:

```ts
case DatabaseType.TDENGINE:
    return new DumpService();
```

```ts
case DatabaseType.TDENGINE:
    return new ImportService();
```

```ts
case DatabaseType.TDENGINE:
    return new TDengineDialect();
```

```ts
case DatabaseType.TDENGINE:
    return new PostgreSqlPageService();
```

- [ ] **Step 6: Use TDengine table source directly**

Update `src/model/main/tableNode.ts` source branch:

```ts
if (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.SQLITE || this.dbType == DatabaseType.DORIS || this.dbType == DatabaseType.TDENGINE) {
```

When reading source SQL, accept `Create Table`, `Create Table`, `Create Table`, `create_table`, or the first value in the first result row.

- [ ] **Step 7: Run focused tests**

Run:

```bash
node -r ./test/testSetup.js test/tdengineDialect.test.js
node -r ./test/testSetup.js test/tdengineServiceIntegration.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit task**

Run:

```bash
git add src/service/dialect/tdengineDialect.ts src/service/serviceManager.ts src/model/main/tableNode.ts test/tdengineDialect.test.js test/tdengineServiceIntegration.test.js
git commit -m "feat: add tdengine dialect"
```

Expected: commit contains dialect and routing changes.

---

### Task 4: Tree and Connection UI

**Files:**
- Create: `resources/icon/tdengine.svg`
- Modify: `src/model/database/connectionNode.ts`
- Modify: `src/model/database/schemaNode.ts`
- Modify: `src/model/main/tableGroup.ts`
- Modify: `src/vue/connect/index.vue`
- Create: `test/tdengineUiConfig.test.js`

**Interfaces:**
- Consumes: `DatabaseType.TDENGINE` and `TDengineDialect`.
- Produces: UI default selection behavior for `TDengine`.
- Produces: tree behavior matching other no-catalog SQL engines.

- [ ] **Step 1: Write failing UI config test**

Create `test/tdengineUiConfig.test.js`:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const vue = read("src/vue/connect/index.vue");
assert.match(vue, /TDengine/);
assert.match(vue, /resources\/icon\/tdengine\.svg/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.user = "root"/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.password = "taosdata"/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.port = 6041/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.database = ""/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.useSSL = false/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.connectTimeout = 5000/);
assert.match(vue, /case "TDengine":[\s\S]*this\.connectionOption\.requestTimeout = 10000/);
assert.match(vue, /'TDengine'[\s\S]*\.includes\(connectionOption\.dbType\)/);

const iconPath = path.resolve(__dirname, "..", "resources/icon/tdengine.svg");
assert.ok(fs.existsSync(iconPath));
assert.match(fs.readFileSync(iconPath, "utf8"), /<svg/);

const schemaNode = read("src/model/database/schemaNode.ts");
assert.match(schemaNode, /DatabaseType\.TDENGINE/);

const tableGroup = read("src/model/main/tableGroup.ts");
assert.match(tableGroup, /DatabaseType\.TDENGINE/);

console.log("tdengineUiConfig tests passed");
```

- [ ] **Step 2: Run UI test to verify it fails**

Run: `node test/tdengineUiConfig.test.js`

Expected: FAIL because TDengine UI config and icon do not exist.

- [ ] **Step 3: Add icon**

Create `resources/icon/tdengine.svg`:

```xml
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TDengine">
  <rect width="64" height="64" rx="12" fill="#0F766E"/>
  <path d="M14 17h36v8H36v22h-8V25H14z" fill="#FFFFFF"/>
  <path d="M40 31h10v6H40zM40 41h10v6H40zM14 41h10v6H14z" fill="#9AF0E5"/>
</svg>
```

- [ ] **Step 4: Update tree nodes**

Update `src/model/database/connectionNode.ts`:

```ts
} else if (this.dbType == DatabaseType.TDENGINE) {
    this.iconPath = path.join(Constants.RES_PATH, "icon/tdengine.svg");
}
```

Add TDengine to no-catalog SQL checks:

```ts
&& this.dbType != DatabaseType.TDENGINE
```

Add TDengine to query database-name branch:

```ts
|| this.dbType == DatabaseType.TDENGINE
```

Update `src/model/database/schemaNode.ts` database icon branch:

```ts
const iconId = this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.DORIS || this.dbType == DatabaseType.TDENGINE ? "database" : "symbol-struct"
```

Update drop target only if needed; TDengine should fall through to `database`.

Update `src/model/main/tableGroup.ts` MySQL-like no-catalog branches to include `DatabaseType.TDENGINE`.

- [ ] **Step 5: Update connection UI**

Update `src/vue/connect/index.vue`:

```js
TDengine: {
  icon: require("@/../resources/icon/tdengine.svg"),
  text: "TD",
  bg: "#ecfdf5",
  color: "#0f766e",
},
```

Add `"TDengine"` near `"Doris"` in `supportDatabases`.

Add `"TDengine"` to the SSL switch and SSL component include lists.

Add watcher case:

```js
case "TDengine":
  this.connectionOption.user = "root";
  this.connectionOption.password = "taosdata";
  this.connectionOption.port = 6041;
  this.connectionOption.database = "";
  this.connectionOption.useSSL = false;
  this.connectionOption.connectTimeout = 5000;
  this.connectionOption.requestTimeout = 10000;
  break;
```

- [ ] **Step 6: Run UI and registration tests**

Run:

```bash
node test/tdengineUiConfig.test.js
node -r ./test/testSetup.js test/tdengineRegistration.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit task**

Run:

```bash
git add resources/icon/tdengine.svg src/model/database/connectionNode.ts src/model/database/schemaNode.ts src/model/main/tableGroup.ts src/vue/connect/index.vue test/tdengineUiConfig.test.js
git commit -m "feat: add tdengine connection ui"
```

Expected: commit contains tree and UI support only.

---

### Task 5: Verification and Packaging Stabilization

**Files:**
- Modify only files needed to fix focused test or build failures discovered in this task.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: passing TDengine tests, nearby backend regression tests, and production build.

- [ ] **Step 1: Run all TDengine tests**

Run:

```bash
node -r ./test/testSetup.js test/tdengineRegistration.test.js
node -r ./test/testSetup.js test/tdengineConnection.test.js
node -r ./test/testSetup.js test/tdengineDialect.test.js
node -r ./test/testSetup.js test/tdengineServiceIntegration.test.js
node test/tdengineUiConfig.test.js
```

Expected: PASS.

- [ ] **Step 2: Run nearby backend regression tests**

Run:

```bash
node -r ./test/testSetup.js test/dorisRegistration.test.js
node -r ./test/testSetup.js test/dorisConnection.test.js
node -r ./test/testSetup.js test/dorisDialect.test.js
node -r ./test/testSetup.js test/clickHouseConnection.test.js
node -r ./test/testSetup.js test/dorisServiceIntegration.test.js
node -r ./test/testSetup.js test/snowflakeRegistration.test.js
node -r ./test/testSetup.js test/snowflakeConnection.test.js
node -r ./test/testSetup.js test/snowflakeDialect.test.js
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS. If webpack reports a missing TDengine runtime package, add that package to `.vscodeignore` and rerun build.

- [ ] **Step 4: Check git status**

Run: `git status --short`

Expected: only intended TDengine files are modified or untracked. `docs/superpowers/plans/2026-07-11-doris-support.md` remains untracked and unstaged.

- [ ] **Step 5: Commit fixes if verification required changes**

Run:

```bash
git add <tdengine-related-files>
git commit -m "fix: stabilize tdengine support"
```

Expected: commit is created only when verification forced additional code or packaging changes.

---

## Self-Review

- Spec coverage: dependency, no-native-driver constraint, SQL tree routing, connection adapter, dialect, pagination, generic import/export choice, UI defaults, logo, packaging, and mocked tests are covered by Tasks 1 through 5.
- Placeholder scan: no forbidden placeholder wording or incomplete task is present.
- Type consistency: `DatabaseType.TDENGINE`, `TDengineConnection`, `createTDengineConfig`, and `TDengineDialect` are introduced before later tasks consume them.
- Scope check: TDengine is a single SQL backend implementation and does not require separate sub-project plans.
