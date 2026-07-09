# Kingbase Official Nodejs Driver Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KingbaseES support using Kingbase's official Nodejs driver package vendored with the extension.

**Architecture:** Vendor the official pure JavaScript `kb` driver under `resources/drivers/kingbase/node_modules`, then load it at runtime from the installed extension path so webpack does not resolve it statically. Add a Kingbase connection class that follows AirDB's existing `IConnection` contract, and register Kingbase as a PostgreSQL-style dialect/page-service database with its own database type and UI option.

**Tech Stack:** VS Code extension, TypeScript, Vue 2, webpack 4, Kingbase official `kb` Nodejs driver V9R1C10 allmode.

## Global Constraints

- Database type string is exactly `KingbaseES`.
- Default KingbaseES port is exactly `54321`.
- Use the official Kingbase `kb` package from `KingbaseES_V009R001C010B0004_NODEJS.zip`.
- Do not use public npm `kb@0.0.5`.
- Do not route Kingbase connections through the generic `pg` package.
- Keep vendored driver files under `resources/drivers/kingbase/node_modules`.
- Runtime loader resolves `resources/drivers/kingbase/node_modules/kb` through `Global.getExtPath`.
- The inspected package has no explicit license metadata; keep provenance next to the vendored files and confirm redistribution permission before public marketplace release.
- Normal `require("kb").Client` must use the pure JavaScript path; do not import `kb/lib/native`.
- Manual live KingbaseES verification is required before release because unit tests use a stubbed client.

---

## File Structure

- Create `resources/drivers/kingbase/README.md`: provenance, retrieval command, package version, license metadata note.
- Copy `resources/drivers/kingbase/node_modules/**`: official Kingbase driver package and its bundled dependencies.
- Create `src/service/connect/kingbaseDriverLoader.ts`: extension-path driver resolution and runtime `require` wrapper.
- Create `src/service/connect/kingbaseConnection.ts`: AirDB connection implementation backed by official `kb.Client`.
- Create `src/service/dialect/kingbaseDialect.ts`: Kingbase dialect class extending PostgreSQL SQL metadata behavior.
- Modify `src/common/constants.ts`: add `DatabaseType.KINGBASE`.
- Modify `src/service/connectionManager.ts`: construct `KingbaseConnection`.
- Modify `src/service/serviceManager.ts`: return `KingbaseDialect` and `PostgreSqlPageService` for Kingbase.
- Modify `src/model/database/connectionNode.ts`: show a database icon for Kingbase connections.
- Modify `src/model/database/schemaNode.ts`: treat Kingbase child schema nodes as schemas when dropping.
- Modify `src/provider/treeDataProvider.ts`: include Kingbase in PostgreSQL-style active database selection.
- Modify `src/vue/connect/index.vue`: add KingbaseES selector tile, defaults, and SSL availability.
- Create `test/kingbaseDriverLoader.test.js`: loader path, success, and failure tests.
- Create `test/kingbaseConnection.test.js`: stubbed client tests for config, callbacks, parameters, events, transactions, and lifecycle.
- Create `test/kingbaseDialect.test.js`: dialect inheritance and SQL shape tests.
- Create `test/kingbaseServiceIntegration.test.js`: enum, dialect, and page-service registration tests.
- Create `test/kingbaseUiConfig.test.js`: connection page text/config assertions.

---

### Task 1: Vendor Official Kingbase Driver

**Files:**
- Create: `resources/drivers/kingbase/README.md`
- Copy: `%TEMP%\airdb-kingbase-nodejs\extracted\nodejs\node_modules` to `resources/drivers/kingbase/node_modules`

**Interfaces:**
- Consumes: Kingbase official ZIP `KingbaseES_V009R001C010B0004_NODEJS.zip`
- Produces: `resources/drivers/kingbase/node_modules/kb/package.json` and `require("./resources/drivers/kingbase/node_modules/kb").Client`

- [ ] **Step 1: Create the vendor directory**

Run:

```powershell
New-Item -ItemType Directory -Force resources\drivers\kingbase | Out-Null
```

Expected: command exits with code `0`.

- [ ] **Step 2: Ensure the official ZIP and extracted package exist**

Run:

```powershell
$root = Join-Path $env:TEMP "airdb-kingbase-nodejs"
$zip = Join-Path $root "KingbaseES_V009R001C010B0004_NODEJS.zip"
$extract = Join-Path $root "extracted"
if (!(Test-Path $zip)) {
  New-Item -ItemType Directory -Force $root | Out-Null
  Invoke-WebRequest `
    -Uri "https://kingbase.oss-cn-beijing.aliyuncs.com/upload/KESV9-baseline/allmode/V009R001C010/V009R001C010B0004_interface/NODEJS/KingbaseES_V009R001C010B0004_NODEJS.zip" `
    -Headers @{ Referer = "https://www.kingbase.com.cn/download.html"; "User-Agent" = "Mozilla/5.0" } `
    -OutFile $zip
}
if (!(Test-Path (Join-Path $extract "nodejs\node_modules\kb\package.json"))) {
  Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
}
Get-Item (Join-Path $extract "nodejs\node_modules\kb\package.json") | Select-Object FullName,Length
```

Expected: output includes `nodejs\node_modules\kb\package.json`.

- [ ] **Step 3: Copy the vendored modules into extension resources**

Run:

```powershell
Copy-Item `
  -Path "$env:TEMP\airdb-kingbase-nodejs\extracted\nodejs\node_modules" `
  -Destination "resources\drivers\kingbase" `
  -Recurse `
  -Force
```

Expected: command exits with code `0`.

- [ ] **Step 4: Write the provenance README**

Create `resources/drivers/kingbase/README.md` with exactly:

```markdown
# KingbaseES Official Nodejs Driver

This directory contains Kingbase's official Nodejs interface driver for KingbaseES.

## Source

- Download page: https://www.kingbase.com.cn/download.html
- Package: KingbaseES_V009R001C010B0004_NODEJS.zip
- Driver line: KES V9R1C10 allmode
- Direct URL: https://kingbase.oss-cn-beijing.aliyuncs.com/upload/KESV9-baseline/allmode/V009R001C010/V009R001C010B0004_interface/NODEJS/KingbaseES_V009R001C010B0004_NODEJS.zip
- Retrieved: 2026-07-09

The direct OSS URL requires the Kingbase download page referer.

```powershell
Invoke-WebRequest `
  -Uri "https://kingbase.oss-cn-beijing.aliyuncs.com/upload/KESV9-baseline/allmode/V009R001C010/V009R001C010B0004_interface/NODEJS/KingbaseES_V009R001C010B0004_NODEJS.zip" `
  -Headers @{ Referer = "https://www.kingbase.com.cn/download.html"; "User-Agent" = "Mozilla/5.0" } `
  -OutFile "$env:TEMP\airdb-kingbase-nodejs\KingbaseES_V009R001C010B0004_NODEJS.zip"
```

## Package

- Runtime entry: `node_modules/kb`
- Package name: `kb`
- Package version: `Build Version{ V009R001B0001 [d49ef542 2025-06-24 23:30:41] }`
- Runtime mode used by AirDB: pure JavaScript `require("kb").Client`

The inspected package contains no `.node`, `.dll`, `.so`, `.dylib`, or `.exe` files. The `kb/lib/native` path references `kb-native`; AirDB does not import that path.

## License Metadata

The inspected `package.json` files have empty or missing `license` fields. Confirm Kingbase redistribution permission before publishing this extension package to a public marketplace.
```

- [ ] **Step 5: Verify the vendored package can be loaded**

Run:

```powershell
node -e "const pkg=require('./resources/drivers/kingbase/node_modules/kb/package.json'); const kb=require('./resources/drivers/kingbase/node_modules/kb'); console.log(pkg.name); console.log(pkg.version); console.log(typeof kb.Client);"
```

Expected:

```text
kb
Build Version{ V009R001B0001 [d49ef542 2025-06-24 23:30:41] }
function
```

- [ ] **Step 6: Verify no native or executable files were copied**

Run:

```powershell
Get-ChildItem -Recurse resources\drivers\kingbase\node_modules -Include *.node,*.dll,*.so,*.dylib,*.exe
```

Expected: no output.

- [ ] **Step 7: Commit the vendored driver**

Run:

```powershell
git add resources/drivers/kingbase
git commit -m "chore: vendor official kingbase nodejs driver"
```

Expected: commit succeeds.

---

### Task 2: Runtime Driver Loader

**Files:**
- Create: `src/service/connect/kingbaseDriverLoader.ts`
- Test: `test/kingbaseDriverLoader.test.js`

**Interfaces:**
- Consumes: `Global.getExtPath(...paths: string[])`
- Produces:
  - `KINGBASE_DRIVER_RELATIVE_PATH: string[]`
  - `getKingbaseDriverPath(): string`
  - `loadKingbaseDriverFromPath(driverPath: string, runtimeRequire?: RuntimeRequire): any`
  - `loadKingbaseDriver(runtimeRequire?: RuntimeRequire): any`
  - `createMissingKingbaseDriverError(cause: unknown): Error`

- [ ] **Step 1: Write the failing loader test**

Create `test/kingbaseDriverLoader.test.js` with exactly:

```javascript
const assert = require("assert");
const path = require("path");
const { requireTs, root } = require("./testSetup");

const { Global } = requireTs("src/common/global.ts");
const {
  KINGBASE_DRIVER_RELATIVE_PATH,
  createMissingKingbaseDriverError,
  getKingbaseDriverPath,
  loadKingbaseDriverFromPath,
} = requireTs("src/service/connect/kingbaseDriverLoader.ts");

Global.context = { extensionPath: root };

assert.deepStrictEqual(KINGBASE_DRIVER_RELATIVE_PATH, [
  "resources",
  "drivers",
  "kingbase",
  "node_modules",
  "kb",
]);

assert.strictEqual(
  getKingbaseDriverPath(),
  path.join(root, "resources", "drivers", "kingbase", "node_modules", "kb")
);

function FakeClient() {}
const fakeDriver = { Client: FakeClient };
const loadedDriver = loadKingbaseDriverFromPath("virtual-driver-path", (id) => {
  assert.strictEqual(id, "virtual-driver-path");
  return fakeDriver;
});
assert.strictEqual(loadedDriver, fakeDriver);

assert.throws(
  () => loadKingbaseDriverFromPath("virtual-driver-path", () => ({})),
  /Kingbase official Nodejs driver is missing.*Driver did not export Client/
);

assert.throws(
  () =>
    loadKingbaseDriverFromPath("virtual-driver-path", () => {
      throw new Error("cannot find kb");
    }),
  /Kingbase official Nodejs driver is missing.*cannot find kb/
);

const error = createMissingKingbaseDriverError(new Error("missing package"));
assert.match(error.message, /resources\/drivers\/kingbase\/node_modules\/kb/);
assert.match(error.message, /missing package/);

const vendoredDriver = loadKingbaseDriverFromPath(
  path.join(root, "resources", "drivers", "kingbase", "node_modules", "kb"),
  require
);
assert.strictEqual(typeof vendoredDriver.Client, "function");

console.log("kingbaseDriverLoader tests passed");
```

- [ ] **Step 2: Run the loader test to verify it fails before implementation**

Run:

```powershell
node test/kingbaseDriverLoader.test.js
```

Expected: FAIL with a module-not-found error for `kingbaseDriverLoader.ts`.

- [ ] **Step 3: Implement the loader**

Create `src/service/connect/kingbaseDriverLoader.ts` with exactly:

```typescript
import { Global } from "@/common/global";

export type RuntimeRequire = (id: string) => any;

export const KINGBASE_DRIVER_RELATIVE_PATH = [
    "resources",
    "drivers",
    "kingbase",
    "node_modules",
    "kb",
];

function getRuntimeRequire(): RuntimeRequire {
    return eval("require") as RuntimeRequire;
}

export function getKingbaseDriverPath(): string {
    return Global.getExtPath(...KINGBASE_DRIVER_RELATIVE_PATH);
}

export function createMissingKingbaseDriverError(cause: unknown): Error {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new Error(
        `Kingbase official Nodejs driver is missing. Rebuild the extension with resources/drivers/kingbase/node_modules/kb. ${detail}`
    );
}

export function loadKingbaseDriverFromPath(
    driverPath: string,
    runtimeRequire: RuntimeRequire = getRuntimeRequire()
): any {
    try {
        const driver = runtimeRequire(driverPath);
        if (!driver || typeof driver.Client !== "function") {
            throw new Error("Driver did not export Client");
        }
        return driver;
    } catch (err) {
        throw createMissingKingbaseDriverError(err);
    }
}

export function loadKingbaseDriver(runtimeRequire?: RuntimeRequire): any {
    return loadKingbaseDriverFromPath(getKingbaseDriverPath(), runtimeRequire || getRuntimeRequire());
}
```

- [ ] **Step 4: Run the loader test to verify it passes**

Run:

```powershell
node test/kingbaseDriverLoader.test.js
```

Expected:

```text
kingbaseDriverLoader tests passed
```

- [ ] **Step 5: Commit the loader**

Run:

```powershell
git add src/service/connect/kingbaseDriverLoader.ts test/kingbaseDriverLoader.test.js
git commit -m "feat: load official kingbase driver at runtime"
```

Expected: commit succeeds.

---

### Task 3: Kingbase Connection Class

**Files:**
- Create: `src/service/connect/kingbaseConnection.ts`
- Test: `test/kingbaseConnection.test.js`

**Interfaces:**
- Consumes:
  - `loadKingbaseDriver(): KingbaseDriverLike`
  - `IConnection`
  - `Node` connection options
- Produces:
  - `KingbaseDriverLike`
  - `KingbaseClientLike`
  - `KingbaseConnection extends IConnection`
  - `KingbaseConnection.query(sql, callback)`
  - `KingbaseConnection.query(sql, values, callback)`

- [ ] **Step 1: Write the failing connection test**

Create `test/kingbaseConnection.test.js` with exactly:

```javascript
const assert = require("assert");
const { EventEmitter } = require("events");
const { requireTs } = require("./testSetup");

const { KingbaseConnection } = requireTs("src/service/connect/kingbaseConnection.ts");

class FakeClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this._connected = true;
    this._ending = false;
    this._queryable = true;
    this.queries = [];
    this.results = [];
    FakeClient.instances.push(this);
  }

  connect(callback) {
    this.connectCalled = true;
    callback(null);
  }

  query(sql, values, callback) {
    if (typeof values === "function") {
      callback = values;
      values = undefined;
    }
    this.queries.push({ sql, values });
    const result =
      this.results.length > 0
        ? this.results.shift()
        : { command: "SELECT", rows: [{ id: 1 }], fields: [{ name: "id" }] };
    process.nextTick(() => callback(null, result));
  }

  end() {
    this._ending = true;
    this._connected = false;
  }
}

FakeClient.instances = [];

function buildConnection() {
  const node = {
    host: "127.0.0.1",
    port: 54321,
    user: "system",
    password: "pw",
    database: "test",
    connectTimeout: 7000,
    requestTimeout: 11000,
    useSSL: false,
  };
  const connection = new KingbaseConnection(node, { Client: FakeClient });
  return { connection, client: FakeClient.instances[FakeClient.instances.length - 1] };
}

function connect(connection) {
  return new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()));
  });
}

function query(connection, sql, values) {
  return new Promise((resolve, reject) => {
    const callback = (err, results, fields) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ results, fields });
    };
    if (arguments.length === 3) {
      connection.query(sql, values, callback);
    } else {
      connection.query(sql, callback);
    }
  });
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  const { connection, client } = buildConnection();

  assert.deepStrictEqual(client.config, {
    host: "127.0.0.1",
    port: 54321,
    user: "system",
    password: "pw",
    database: "test",
    connectionTimeoutMillis: 7000,
    statement_timeout: 11000,
  });

  assert.strictEqual(connection.isAlive(), true);
  await connect(connection);
  assert.strictEqual(client.connectCalled, true);

  const selectResult = await query(connection, "SELECT 1");
  assert.deepStrictEqual(selectResult.results, [{ id: 1 }]);
  assert.deepStrictEqual(selectResult.fields, [{ name: "id" }]);

  client.results.push({ command: "UPDATE", rowCount: 2, rows: [], fields: [] });
  const updateResult = await query(connection, "UPDATE demo SET name=$1", ["AirDB"]);
  assert.deepStrictEqual(updateResult.results, { affectedRows: 2 });
  assert.deepStrictEqual(client.queries[client.queries.length - 1], {
    sql: "UPDATE demo SET name=$1",
    values: ["AirDB"],
  });

  client.results.push({ command: "SELECT", rows: [{ id: 1 }, { id: 2 }], fields: [] });
  const event = connection.query("SELECT * FROM demo");
  const resultFlags = [];
  event.on("result", (_row, isLast) => resultFlags.push(isLast));
  await flush();
  assert.deepStrictEqual(resultFlags, [false, true]);

  client.results.push({ command: "SELECT", rows: [], fields: [] });
  const emptyEvent = connection.query("SELECT * FROM empty_demo");
  let ended = false;
  emptyEvent.on("end", () => {
    ended = true;
  });
  await flush();
  assert.strictEqual(ended, true);

  await new Promise((resolve) => connection.beginTransaction(resolve));
  await connection.rollback();
  await connection.commit();
  assert.deepStrictEqual(
    client.queries.slice(-3).map((entry) => entry.sql),
    ["BEGIN", "ROLLBACK", "COMMIT"]
  );

  connection.end();
  assert.strictEqual(connection.isAlive(), false);

  console.log("kingbaseConnection tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the connection test to verify it fails before implementation**

Run:

```powershell
node test/kingbaseConnection.test.js
```

Expected: FAIL with a module-not-found error for `kingbaseConnection.ts`.

- [ ] **Step 3: Implement the connection**

Create `src/service/connect/kingbaseConnection.ts` with exactly:

```typescript
import * as fs from "fs";
import { EventEmitter } from "events";
import { Node } from "@/model/interface/node";
import { IConnection, queryCallback } from "./connection";
import { loadKingbaseDriver } from "./kingbaseDriverLoader";

export interface KingbaseClientLike {
    connect(callback: (err: Error | null) => void): void;
    query(sql: any, callback: (err: Error | null, res: any) => void): any;
    query(sql: any, values: any, callback: (err: Error | null, res: any) => void): any;
    end(callback?: (err?: Error) => void): any;
    on(event: string, listener: (...args: any[]) => void): any;
}

export interface KingbaseDriverLike {
    Client: new (config: any) => KingbaseClientLike;
}

export class KingbaseConnection extends IConnection {
    private client: KingbaseClientLike;

    constructor(node: Node, driver: KingbaseDriverLike = loadKingbaseDriver()) {
        super();
        const config: any = {
            host: node.host,
            port: node.port || 54321,
            user: node.user,
            password: node.password,
            database: node.database,
            connectionTimeoutMillis: node.connectTimeout || 5000,
            statement_timeout: node.requestTimeout || 10000,
        };
        if (node.useSSL) {
            config.ssl = {
                rejectUnauthorized: false,
                ca: node.caPath ? fs.readFileSync(node.caPath) : null,
                cert: node.clientCertPath ? fs.readFileSync(node.clientCertPath) : null,
                key: node.clientKeyPath ? fs.readFileSync(node.clientKeyPath) : null,
            };
        }
        this.client = new driver.Client(config);
    }

    isAlive(): boolean {
        const client = this.client as any;
        if (this.dead) {
            return false;
        }
        if (typeof client._connected === "boolean") {
            return client._connected && !client._ending && client._queryable !== false;
        }
        return !client._ending;
    }

    query(sql: string, callback?: queryCallback): EventEmitter;
    query(sql: string, values: any, callback?: queryCallback): EventEmitter;
    query(sql: any, values?: any, callback?: any): EventEmitter {
        if (!callback && values instanceof Function) {
            callback = values;
            values = undefined;
        }

        const event = new EventEmitter();
        const handler = (err: Error | null, res: any) => {
            if (err) {
                if (callback) {
                    callback(err);
                }
                this.end();
                event.emit("error", err.message);
                return;
            }

            if (!callback) {
                const rows = res?.rows || [];
                if (rows.length === 0) {
                    event.emit("end");
                }
                for (let i = 1; i <= rows.length; i++) {
                    event.emit("result", this.convertToDump(rows[i - 1]), rows.length === i);
                }
                return;
            }

            if (res instanceof Array) {
                callback(null, res.map((row) => this.adaptResult(row)), res.map((row) => row.fields || []));
            } else {
                callback(null, this.adaptResult(res), res?.fields || []);
            }
        };

        if (typeof values !== "undefined") {
            this.client.query(sql, values, handler);
        } else {
            this.client.query(sql, handler);
        }
        return event;
    }

    adaptResult(res: any) {
        if (!res) {
            return [];
        }
        const command = String(res.command || "").toUpperCase();
        if (command && command !== "SELECT" && command !== "SHOW") {
            return { affectedRows: res.rowCount || 0 };
        }
        return res.rows || [];
    }

    connect(callback: (err: Error | null) => void): void {
        this.client.connect((err) => {
            callback(err);
            if (!err) {
                this.client.on("error", () => this.end());
                this.client.on("end", () => this.end());
            }
        });
    }

    async beginTransaction(callback: (err: Error | null) => void) {
        this.client.query("BEGIN", callback);
    }

    async rollback() {
        await this.client.query("ROLLBACK");
    }

    async commit() {
        await this.client.query("COMMIT");
    }

    end(): void {
        if (this.dead) {
            return;
        }
        this.dead = true;
        try {
            this.client.end();
        } catch (err) {
        }
    }
}
```

- [ ] **Step 4: Run the connection test to verify it passes**

Run:

```powershell
node test/kingbaseConnection.test.js
```

Expected:

```text
kingbaseConnection tests passed
```

- [ ] **Step 5: Commit the connection**

Run:

```powershell
git add src/service/connect/kingbaseConnection.ts test/kingbaseConnection.test.js
git commit -m "feat: add kingbase connection"
```

Expected: commit succeeds.

---

### Task 4: Database Type, Dialect, Services, and Tree Behavior

**Files:**
- Create: `src/service/dialect/kingbaseDialect.ts`
- Modify: `src/common/constants.ts`
- Modify: `src/service/connectionManager.ts`
- Modify: `src/service/serviceManager.ts`
- Modify: `src/model/database/connectionNode.ts`
- Modify: `src/model/database/schemaNode.ts`
- Modify: `src/provider/treeDataProvider.ts`
- Test: `test/kingbaseDialect.test.js`
- Test: `test/kingbaseServiceIntegration.test.js`

**Interfaces:**
- Consumes:
  - `KingbaseConnection`
  - `PostgreSqlDialect`
  - `PostgreSqlPageService`
- Produces:
  - `DatabaseType.KINGBASE = "KingbaseES"`
  - `KingbaseDialect extends PostgreSqlDialect`
  - `ConnectionManager.create` can construct `KingbaseConnection`
  - `ServiceManager.getDialect(DatabaseType.KINGBASE)` returns `KingbaseDialect`
  - `ServiceManager.getPageService(DatabaseType.KINGBASE)` returns `PostgreSqlPageService`

- [ ] **Step 1: Write the failing dialect test**

Create `test/kingbaseDialect.test.js` with exactly:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { KingbaseDialect } = requireTs("src/service/dialect/kingbaseDialect.ts");
const { PostgreSqlDialect } = requireTs("src/service/dialect/postgreSqlDialect.ts");

const dialect = new KingbaseDialect();

assert(dialect instanceof PostgreSqlDialect);
assert.match(dialect.showDatabases(), /FROM pg_database/i);
assert.match(dialect.showSchemas(), /information_schema\.schemata/i);
assert.match(dialect.showTables("public"), /information_schema\.tables/i);
assert.strictEqual(dialect.pingDataBase("public"), "set schema 'public';");
assert.strictEqual(dialect.pingDataBase(""), "select 1");
assert.strictEqual(dialect.buildPageSql("public", "demo", 20), "SELECT * FROM demo LIMIT 20;");
assert.strictEqual(dialect.countSql("public", "demo"), "SELECT count(*) FROM demo;");

console.log("kingbaseDialect tests passed");
```

- [ ] **Step 2: Write the failing service integration test**

Create `test/kingbaseServiceIntegration.test.js` with exactly:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DatabaseType } = requireTs("src/common/constants.ts");
const { ServiceManager } = requireTs("src/service/serviceManager.ts");
const { KingbaseDialect } = requireTs("src/service/dialect/kingbaseDialect.ts");
const { PostgreSqlPageService } = requireTs("src/service/page/postgreSqlPageService.ts");

assert.strictEqual(DatabaseType.KINGBASE, "KingbaseES");
assert(ServiceManager.getDialect(DatabaseType.KINGBASE) instanceof KingbaseDialect);
assert(ServiceManager.getPageService(DatabaseType.KINGBASE) instanceof PostgreSqlPageService);

console.log("kingbaseServiceIntegration tests passed");
```

- [ ] **Step 3: Run the new integration tests to verify they fail before implementation**

Run:

```powershell
node test/kingbaseDialect.test.js
node test/kingbaseServiceIntegration.test.js
```

Expected: FAIL with module-not-found or missing enum errors.

- [ ] **Step 4: Create the Kingbase dialect**

Create `src/service/dialect/kingbaseDialect.ts` with exactly:

```typescript
import { PostgreSqlDialect } from "./postgreSqlDialect";

export class KingbaseDialect extends PostgreSqlDialect {
}
```

- [ ] **Step 5: Add the database type enum**

In `src/common/constants.ts`, replace the `DatabaseType` enum with:

```typescript
export enum DatabaseType {
    MYSQL = "MySQL", PG = "PostgreSQL", KINGBASE = "KingbaseES", SQLITE = "SQLite",
    MSSQL = "SqlServer", ORACLE = "Oracle", MONGO_DB="MongoDB",
    ES = "ElasticSearch", REDIS = "Redis",SSH="SSH",FTP="FTP"
}
```

- [ ] **Step 6: Register the connection factory**

In `src/service/connectionManager.ts`, add this import next to the other connection imports:

```typescript
import { KingbaseConnection } from "./connect/kingbaseConnection";
```

In the `create(opt: Node)` switch, add this case after `DatabaseType.PG`:

```typescript
            case DatabaseType.KINGBASE:
                return new KingbaseConnection(opt)
```

- [ ] **Step 7: Register dialect and pagination services**

In `src/service/serviceManager.ts`, add this import next to the other dialect imports:

```typescript
import { KingbaseDialect } from "./dialect/kingbaseDialect";
```

In `getDialect(dbType: DatabaseType)`, add this case after `DatabaseType.PG`:

```typescript
            case DatabaseType.KINGBASE:
                return new KingbaseDialect();
```

In `getPageService(databaseType: DatabaseType)`, add this case after `DatabaseType.PG`:

```typescript
            case DatabaseType.KINGBASE:
                return new PostgreSqlPageService();
```

- [ ] **Step 8: Add a tree icon branch for Kingbase**

In `src/model/database/connectionNode.ts`, add this branch after the PostgreSQL icon branch:

```typescript
        } else if (this.dbType == DatabaseType.KINGBASE) {
            this.iconPath = new vscode.ThemeIcon("database");
```

The surrounding block must remain:

```typescript
        if (this.dbType == DatabaseType.PG) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/pg_server.svg");
        } else if (this.dbType == DatabaseType.KINGBASE) {
            this.iconPath = new vscode.ThemeIcon("database");
        } else if (this.dbType == DatabaseType.MSSQL) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/mssql_server.png");
        } else if (this.dbType == DatabaseType.SQLITE) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/sqlite-icon.svg");
        } else if (this.dbType == DatabaseType.ORACLE) {
            this.iconPath = new vscode.ThemeIcon("database");
        } else if (this.dbType == DatabaseType.MONGO_DB) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/mongodb-icon.svg");
        }
```

- [ ] **Step 9: Treat Kingbase schema nodes as schemas for drop operations**

In `src/model/database/schemaNode.ts`, replace the `target` assignment with:

```typescript
        const target = this.dbType == DatabaseType.ORACLE
            ? 'user'
            : (this.dbType == DatabaseType.MSSQL || this.dbType == DatabaseType.PG || this.dbType == DatabaseType.KINGBASE ? 'schema' : 'database');
```

- [ ] **Step 10: Include Kingbase in active database selection**

In `src/provider/treeDataProvider.ts`, replace this condition:

```typescript
            if (cNode.dbType == DatabaseType.MSSQL || cNode.dbType == DatabaseType.PG) {
```

with:

```typescript
            if (cNode.dbType == DatabaseType.MSSQL || cNode.dbType == DatabaseType.PG || cNode.dbType == DatabaseType.KINGBASE) {
```

In the same method, replace this condition:

```typescript
                if (cNode.dbType == DatabaseType.PG || cNode.dbType == DatabaseType.MSSQL) {
```

with:

```typescript
                if (cNode.dbType == DatabaseType.PG || cNode.dbType == DatabaseType.MSSQL || cNode.dbType == DatabaseType.KINGBASE) {
```

- [ ] **Step 11: Run the dialect and service tests**

Run:

```powershell
node test/kingbaseDialect.test.js
node test/kingbaseServiceIntegration.test.js
```

Expected:

```text
kingbaseDialect tests passed
kingbaseServiceIntegration tests passed
```

- [ ] **Step 12: Commit database type integration**

Run:

```powershell
git add src/common/constants.ts src/service/connectionManager.ts src/service/serviceManager.ts src/service/dialect/kingbaseDialect.ts src/model/database/connectionNode.ts src/model/database/schemaNode.ts src/provider/treeDataProvider.ts test/kingbaseDialect.test.js test/kingbaseServiceIntegration.test.js
git commit -m "feat: register kingbase database type"
```

Expected: commit succeeds.

---

### Task 5: Connection UI Support

**Files:**
- Modify: `src/vue/connect/index.vue`
- Test: `test/kingbaseUiConfig.test.js`

**Interfaces:**
- Consumes: `DatabaseType.KINGBASE` persisted value `KingbaseES`
- Produces:
  - `supportDatabases` includes `"KingbaseES"`
  - `dbLogoMap.KingbaseES` uses text badge `KB`
  - changing type to `KingbaseES` sets user `system`, port `54321`, database `test`, and `encrypt = false`
  - SSL switch and SSL component include `KingbaseES`

- [ ] **Step 1: Write the failing UI config test**

Create `test/kingbaseUiConfig.test.js` with exactly:

```javascript
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.resolve(__dirname, "../src/vue/connect/index.vue"), "utf8");

assert.match(source, /KingbaseES:\s*\{\s*text:\s*"KB"/);
assert.match(source, /supportDatabases:\s*\[[\s\S]*"PostgreSQL",\s*"KingbaseES"/);
assert.match(source, /connectionOption\.dbType == 'KingbaseES'/);
assert.match(source, /\['MySQL', 'PostgreSQL', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch'\]/);
assert.match(
  source,
  /case "KingbaseES":[\s\S]*this\.connectionOption\.user = "system";[\s\S]*this\.connectionOption\.encrypt = false;[\s\S]*this\.connectionOption\.port = 54321;[\s\S]*this\.connectionOption\.database = "test";/
);

console.log("kingbaseUiConfig tests passed");
```

- [ ] **Step 2: Run the UI config test to verify it fails before implementation**

Run:

```powershell
node test/kingbaseUiConfig.test.js
```

Expected: FAIL because `KingbaseES` is not present in `index.vue`.

- [ ] **Step 3: Add KingbaseES logo metadata**

In `src/vue/connect/index.vue`, add this object after the `PostgreSQL` entry in `dbLogoMap`:

```javascript
  KingbaseES: {
    text: "KB",
    bg: "#ecfeff",
    color: "#0891b2",
  },
```

- [ ] **Step 4: Add KingbaseES to the selector**

In `src/vue/connect/index.vue`, add `"KingbaseES"` immediately after `"PostgreSQL"` in `supportDatabases`:

```javascript
      supportDatabases: [
        "MySQL",
        "PostgreSQL",
        "KingbaseES",
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

- [ ] **Step 5: Add KingbaseES to SSL switch visibility**

In `src/vue/connect/index.vue`, replace the SSL switch `v-if` database list with:

```vue
          connectionOption.dbType == 'MySQL' ||
          connectionOption.dbType == 'PostgreSQL' ||
          connectionOption.dbType == 'KingbaseES' ||
          connectionOption.dbType == 'MongoDB' ||
          connectionOption.dbType == 'Redis'
```

- [ ] **Step 6: Add KingbaseES to SSL component visibility**

In `src/vue/connect/index.vue`, replace the SSL component database array with:

```vue
        ['MySQL', 'PostgreSQL', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch'].includes(connectionOption.dbType)
```

- [ ] **Step 7: Add KingbaseES defaults**

In `src/vue/connect/index.vue`, add this case after the PostgreSQL case in the `connectionOption.dbType` watcher:

```javascript
        case "KingbaseES":
          this.connectionOption.user = "system";
          this.connectionOption.encrypt = false;
          this.connectionOption.port = 54321;
          this.connectionOption.database = "test";
          break;
```

- [ ] **Step 8: Run the UI config test**

Run:

```powershell
node test/kingbaseUiConfig.test.js
```

Expected:

```text
kingbaseUiConfig tests passed
```

- [ ] **Step 9: Commit UI support**

Run:

```powershell
git add src/vue/connect/index.vue test/kingbaseUiConfig.test.js
git commit -m "feat: add kingbase connection option"
```

Expected: commit succeeds.

---

### Task 6: Full Verification and Build

**Files:**
- Read: all files modified by Tasks 1-5
- Modify: only files needed to fix failures surfaced by the commands in this task

**Interfaces:**
- Consumes: completed Tasks 1-5
- Produces: passing focused tests and production webpack build

- [ ] **Step 1: Run focused Kingbase tests**

Run:

```powershell
node test/kingbaseDriverLoader.test.js
node test/kingbaseConnection.test.js
node test/kingbaseDialect.test.js
node test/kingbaseServiceIntegration.test.js
node test/kingbaseUiConfig.test.js
```

Expected:

```text
kingbaseDriverLoader tests passed
kingbaseConnection tests passed
kingbaseDialect tests passed
kingbaseServiceIntegration tests passed
kingbaseUiConfig tests passed
```

- [ ] **Step 2: Run existing related regression tests**

Run:

```powershell
node test/oracleDialect.test.js
node test/oracleResultAdapter.test.js
node test/tableFilterSql.test.js
```

Expected:

```text
oracleDialect tests passed
oracleResultAdapter tests passed
tableFilterSql tests passed
```

- [ ] **Step 3: Run the production build**

Run:

```powershell
npm run build
```

Expected: webpack production build exits with code `0`.

- [ ] **Step 4: Verify the vendored driver is still outside excluded top-level node_modules**

Run:

```powershell
Test-Path resources\drivers\kingbase\node_modules\kb\package.json
Select-String -Path .vscodeignore -Pattern "^resources/"
Select-String -Path .vscodeignore -Pattern "^node_modules/"
```

Expected:

```text
True
node_modules/
```

There should be no `resources/` exclusion line.

- [ ] **Step 5: Inspect changed files**

Run:

```powershell
git status --short
git diff --stat HEAD
```

Expected: only Kingbase implementation, test, and vendored driver files are present.

- [ ] **Step 6: Commit verification fixes if any files changed after the previous commits**

Run this only when Step 1, Step 2, or Step 3 required a code change:

```powershell
git add src test resources
git commit -m "test: verify kingbase integration"
```

Expected: commit succeeds when there are staged changes. If there are no staged changes, skip this command.

- [ ] **Step 7: Record manual live verification checklist for release notes**

Run these checks against a real KingbaseES instance before publishing:

```text
1. Create a KingbaseES connection with host, user, password, database, and port 54321.
2. Connect successfully from the AirDB connection page.
3. Expand catalog, schema, table, and view nodes in the SQL tree.
4. Open a query page and run SELECT 1.
5. Open a table data page and verify LIMIT/OFFSET pagination.
6. Run an INSERT with $1 parameters against a scratch table.
7. Run UPDATE and DELETE against the scratch table and verify affected rows.
8. Enable SSL when the server supports SSL and verify the connection opens.
9. Enable SSH tunnel and verify the connection opens through the tunnel.
```

Expected: all checks pass before release.

---

## Self-Review

- Spec coverage: the plan includes official driver vendoring, provenance, runtime loading, connection class, database type registration, PostgreSQL-style dialect/page behavior, UI defaults, unit tests, build verification, and manual live verification.
- Placeholder scan: all task steps contain concrete paths, commands, expected outputs, and code blocks where files change.
- Type consistency: the loader exports `loadKingbaseDriver`, the connection consumes `KingbaseDriverLike`, the service layer consumes `KingbaseDialect`, and every test imports the exact file and symbol names defined in the preceding tasks.
