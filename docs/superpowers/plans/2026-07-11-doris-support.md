# Apache Doris Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Apache Doris as a first-class SQL database type in AirDB.

**Architecture:** Doris uses the existing SQL tree, query workspace, table result page, import/export entry points, and MySQL-compatible wire protocol through the existing `mysql2` dependency. Add Doris-specific routing and a Doris dialect so metadata SQL and table templates are safe for Doris while connection behavior stays a thin MySQL-compatible wrapper.

**Tech Stack:** TypeScript VS Code extension host, Vue 2 connection webview, Node direct assertion tests, existing `mysql2`, existing `MysqlPageSerivce`, existing `MysqlImportService`, existing `MysqlDumpService`.

## Global Constraints

- Doris FE exposes a MySQL-compatible protocol service on `query_port`, default `9030`.
- Do not add a Doris runtime dependency.
- Use the existing `mysql2` dependency.
- Add `DatabaseType.DORIS = "Doris"`.
- Doris is a SQL backend and stays under `CacheKey.DATBASE_CONECTIONS`.
- Doris must not appear in the NoSQL tree.
- Default connection values are host `127.0.0.1`, port `9030`, user `root`, empty password, and empty database.
- Reuse `MysqlPageSerivce` because Doris supports MySQL-style `LIMIT offset, count`.
- Reuse MySQL-compatible import/export services for phase one.
- Do not implement Doris Stream Load, Broker Load, Routine Load, S3 load workflows, FE/BE node administration, materialized view management, privilege editing, or a live Doris integration test.
- Run the focused Node tests and `npm run build` before completion.

---

## File Structure

Create:

- `src/service/connect/dorisConnection.ts`: thin Doris connection class extending `MysqlConnection`, with a defensive `9030` default.
- `src/service/dialect/dorisDialect.ts`: Doris metadata SQL and OLAP table template.
- `resources/icon/doris.svg`: Doris icon used by the connection page and tree.
- `test/dorisConnection.test.js`: asserts Doris connection extends the MySQL connection path.
- `test/dorisDialect.test.js`: asserts Doris dialect SQL and MySQL inheritance.
- `test/dorisServiceIntegration.test.js`: asserts Doris service routing.
- `test/dorisRegistration.test.js`: asserts constants, connection factory routing, tree semantics, and model integration.
- `test/dorisUiConfig.test.js`: asserts connection page logo, selector, defaults, and SSL visibility.

Modify:

- `src/common/constants.ts`: add `DatabaseType.DORIS`.
- `src/service/connectionManager.ts`: route Doris to `DorisConnection`.
- `src/service/serviceManager.ts`: route Doris dialect/page/import/dump services.
- `src/provider/treeDataProvider.ts`: keep Doris in SQL registration paths and active database behavior.
- `src/model/database/connectionNode.ts`: use Doris icon, avoid catalog mode, and use schema-style active query selection.
- `src/model/database/schemaNode.ts`: render Doris database nodes with database icon semantics.
- `src/model/main/tableGroup.ts`: use schema-style filter and pin-state keys for Doris.
- `src/model/main/tableNode.ts`: use `SHOW CREATE TABLE` source flow for Doris.
- `src/vue/connect/index.vue`: add Doris selector, logo, defaults, and SSL visibility.

---

### Task 1: Add Doris Connection Type

**Files:**
- Modify: `src/common/constants.ts`
- Create: `src/service/connect/dorisConnection.ts`
- Modify: `src/service/connectionManager.ts`
- Test: `test/dorisConnection.test.js`

**Interfaces:**
- Produces: `DatabaseType.DORIS = "Doris"`.
- Produces: `DorisConnection extends MysqlConnection`.
- Consumes: `MysqlConnection` constructor shape and existing `Node` connection fields.
- Produces: `ConnectionManager.create()` Doris branch.

- [ ] **Step 1: Write the failing connection test**

Create `test/dorisConnection.test.js`:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DorisConnection } = requireTs("src/service/connect/dorisConnection.ts");
const { MysqlConnection } = requireTs("src/service/connect/mysqlConnection.ts");

assert.strictEqual(
  Object.getPrototypeOf(DorisConnection.prototype),
  MysqlConnection.prototype
);

const connection = new DorisConnection({
  host: "127.0.0.1",
  port: 9030,
  user: "root",
  password: "",
  database: "",
  dbType: "Doris",
});

assert(connection instanceof MysqlConnection);
assert(connection instanceof DorisConnection);

console.log("dorisConnection tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node test/dorisConnection.test.js
```

Expected: FAIL with `Cannot find module` for `dorisConnection.ts`.

- [ ] **Step 3: Add the Doris enum**

In `src/common/constants.ts`, change the SQL database enum section to include Doris near ClickHouse and DuckDB:

```typescript
export enum DatabaseType {
    MYSQL = "MySQL", PG = "PostgreSQL", KINGBASE = "KingbaseES", DAMENG = "Dameng", SQLITE = "SQLite",
    MSSQL = "SqlServer", ORACLE = "Oracle", MONGO_DB="MongoDB",
    CLICKHOUSE = "ClickHouse", DORIS = "Doris", DUCKDB = "DuckDB",
    ES = "ElasticSearch", REDIS = "Redis", KAFKA = "Kafka", RABBITMQ = "RabbitMQ", SSH="SSH",FTP="FTP"
}
```

- [ ] **Step 4: Add DorisConnection**

Create `src/service/connect/dorisConnection.ts`:

```typescript
import { Node } from "@/model/interface/node";
import { MysqlConnection } from "./mysqlConnection";

export class DorisConnection extends MysqlConnection {
    constructor(node: Node) {
        super({
            ...node,
            port: node.port || 9030,
        } as Node);
    }
}
```

- [ ] **Step 5: Register Doris in ConnectionManager**

In `src/service/connectionManager.ts`, add the import:

```typescript
import { DorisConnection } from "./connect/dorisConnection";
```

Add the switch case near ClickHouse and DuckDB:

```typescript
            case DatabaseType.CLICKHOUSE:
                return new ClickHouseConnection(opt);
            case DatabaseType.DORIS:
                return new DorisConnection(opt);
            case DatabaseType.DUCKDB:
                return new DuckDBConnection(opt);
```

- [ ] **Step 6: Run the focused test**

Run:

```powershell
node test/dorisConnection.test.js
```

Expected: PASS and prints `dorisConnection tests passed`.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/common/constants.ts src/service/connect/dorisConnection.ts src/service/connectionManager.ts test/dorisConnection.test.js
git commit -m "feat: add doris connection type"
```

---

### Task 2: Add Doris Dialect and Service Routing

**Files:**
- Create: `src/service/dialect/dorisDialect.ts`
- Modify: `src/service/serviceManager.ts`
- Test: `test/dorisDialect.test.js`
- Test: `test/dorisServiceIntegration.test.js`

**Interfaces:**
- Produces: `DorisDialect extends MysqlDialect`.
- Produces: `ServiceManager.getDialect(DatabaseType.DORIS)` returns `DorisDialect`.
- Produces: `ServiceManager.getPageService(DatabaseType.DORIS)` returns `MysqlPageSerivce`.
- Produces: `ServiceManager.getImportService(DatabaseType.DORIS)` returns `MysqlImportService`.
- Produces: `ServiceManager.getDumpService(DatabaseType.DORIS)` returns `MysqlDumpService`.

- [ ] **Step 1: Write the Doris dialect test**

Create `test/dorisDialect.test.js`:

```javascript
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DorisDialect } = requireTs("src/service/dialect/dorisDialect.ts");
const { MysqlDialect } = requireTs("src/service/dialect/mysqlDialect.ts");

const dialect = new DorisDialect();

assert(dialect instanceof MysqlDialect);
assert.strictEqual(dialect.createDatabase("analytics"), "CREATE DATABASE `analytics`");
assert.strictEqual(dialect.pingDataBase("analytics"), "use `analytics`");
assert.strictEqual(dialect.pingDataBase(""), "select 1");

assert.match(dialect.tableTemplate(), /ENGINE=OLAP/);
assert.match(dialect.tableTemplate(), /DUPLICATE KEY/);
assert.match(dialect.tableTemplate(), /DISTRIBUTED BY HASH/);
assert.match(dialect.tableTemplate(), /PROPERTIES/);

assert.match(dialect.showTables("analytics"), /information_schema\.TABLES/i);
assert.match(dialect.showTables("analytics"), /TABLE_SCHEMA = 'analytics'/);
assert.match(dialect.showTables("analytics"), /TABLE_TYPE <> 'VIEW'/);
assert.match(dialect.showTables("analytics"), /TABLE_NAME as `name`/);

assert.match(dialect.showViews("analytics"), /information_schema\.VIEWS/i);
assert.match(dialect.showViews("analytics"), /TABLE_SCHEMA = 'analytics'/);
assert.match(dialect.showViews("analytics"), /TABLE_NAME name/);

assert.match(dialect.showColumns("analytics", "orders"), /information_schema\.COLUMNS/i);
assert.match(dialect.showColumns("analytics", "orders"), /COLUMN_NAME name/);
assert.match(dialect.showColumns("analytics", "orders"), /DATA_TYPE simpleType/);
assert.match(dialect.showColumns("analytics", "orders"), /DATA_TYPE type/);
assert.match(dialect.showColumns("analytics", "orders"), /TABLE_NAME = 'orders'/);

console.log("dorisDialect tests passed");
```

- [ ] **Step 2: Write the service integration test**

Create `test/dorisServiceIntegration.test.js`:

```javascript
const assert = require("assert");
const path = require("path");
const { requireTs, root } = require("./testSetup");

function mockModule(relativePath, exports) {
  const filename = path.resolve(root, relativePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  };
}

class EmptyDisposableProvider {}
class MockDorisDialect {}
class MockMysqlPageService {}
class MockMysqlImportService {}
class MockMysqlDumpService {}

mockModule("src/provider/treeDataProvider.ts", {
  DbTreeDataProvider: class DbTreeDataProvider {},
});
mockModule("src/provider/codelen/sqlCodeLensProvider.ts", { SqlCodeLensProvider: EmptyDisposableProvider });
mockModule("src/provider/complete/completionProvider.ts", { CompletionProvider: EmptyDisposableProvider });
mockModule("src/provider/sqlFormattingProvider.ts", { SqlFormattingProvider: EmptyDisposableProvider });
mockModule("src/provider/tableInfoHoverProvider.ts", { TableInfoHoverProvider: EmptyDisposableProvider });
mockModule("src/provider/codelen/highlightCreator.ts", { HighlightCreator: EmptyDisposableProvider });
mockModule("src/provider/sqlSymbolProvide.ts", { SQLSymbolProvide: EmptyDisposableProvider });
mockModule("src/service/connect/connectService.ts", { ConnectService: EmptyDisposableProvider });
mockModule("src/service/status/mysqlStatusService.ts", { MysqlStatusService: EmptyDisposableProvider });
mockModule("src/service/user/UserCenterService.ts", { UserCenterService: EmptyDisposableProvider });
mockModule("src/model/ssh/connectionProvider.ts", { default: EmptyDisposableProvider });
mockModule("src/service/mock/mockRunner.ts", { MockRunner: EmptyDisposableProvider });
mockModule("src/service/dialect/dorisDialect.ts", { DorisDialect: MockDorisDialect });
mockModule("src/service/dump/dumpService.ts", { DumpService: EmptyDisposableProvider });
mockModule("src/service/dump/mysqlDumpService.ts", { MysqlDumpService: MockMysqlDumpService });
mockModule("src/service/import/mysqlImportService.ts", { MysqlImportService: MockMysqlImportService });
mockModule("src/service/import/postgresqlImortService.ts", { PostgresqlImortService: EmptyDisposableProvider });
mockModule("src/service/import/sqlServerImportService.ts", { SqlServerImportService: EmptyDisposableProvider });
mockModule("src/service/import/kingbaseImportService.ts", { KingbaseImportService: EmptyDisposableProvider });
mockModule("src/service/import/damengImportService.ts", { DamengImportService: EmptyDisposableProvider });
mockModule("src/service/dump/kingbaseDumpService.ts", { KingbaseDumpService: EmptyDisposableProvider });
mockModule("src/service/dump/damengDumpService.ts", { DamengDumpService: EmptyDisposableProvider });
mockModule("src/service/page/mysqlPageSerivce.ts", { MysqlPageSerivce: MockMysqlPageService });
mockModule("src/service/page/esPageService.ts", { EsPageService: EmptyDisposableProvider });
mockModule("src/service/page/mongoPageService.ts", { MongoPageService: EmptyDisposableProvider });
mockModule("src/service/page/damengPageService.ts", { DamengPageService: EmptyDisposableProvider });
mockModule("src/service/common/historyRecorder.ts", { HistoryRecorder: EmptyDisposableProvider });
mockModule("src/service/common/databaseCache.ts", {
  DatabaseCache: {
    initCache() {},
    storeElementState() {},
  },
});
mockModule("src/common/filesManager.ts", {
  FileManager: {
    init() {},
  },
});
mockModule("src/common/viewManager.ts", {
  ViewManager: {
    initExtesnsionPath() {},
  },
});
mockModule("src/common/Console.ts", {
  Console: {
    log() {},
  },
});
mockModule("src/service/status/statusService.ts", { StatusService: EmptyDisposableProvider });

const globalPath = path.resolve(root, "src/common/global.ts");
require.cache[globalPath] = {
  id: globalPath,
  filename: globalPath,
  loaded: true,
  exports: {
    Global: class Global {
      static getExtPath() {
        return "";
      }
      static getConfig(_key, defaultValue) {
        return defaultValue;
      }
    },
  },
};

const { DatabaseType } = requireTs("src/common/constants.ts");
const { ServiceManager } = requireTs("src/service/serviceManager.ts");
const { DorisDialect } = requireTs("src/service/dialect/dorisDialect.ts");
const { MysqlPageSerivce } = requireTs("src/service/page/mysqlPageSerivce.ts");
const { MysqlImportService } = requireTs("src/service/import/mysqlImportService.ts");
const { MysqlDumpService } = requireTs("src/service/dump/mysqlDumpService.ts");

assert.strictEqual(DatabaseType.DORIS, "Doris");
assert(ServiceManager.getDialect(DatabaseType.DORIS) instanceof DorisDialect);
assert(ServiceManager.getPageService(DatabaseType.DORIS) instanceof MysqlPageSerivce);
assert(ServiceManager.getImportService(DatabaseType.DORIS) instanceof MysqlImportService);
assert(ServiceManager.getDumpService(DatabaseType.DORIS) instanceof MysqlDumpService);

console.log("dorisServiceIntegration tests passed");
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
node test/dorisDialect.test.js
node test/dorisServiceIntegration.test.js
```

Expected: `dorisDialect.test.js` fails because `dorisDialect.ts` does not exist. `dorisServiceIntegration.test.js` fails until service routing is added.

- [ ] **Step 4: Add DorisDialect**

Create `src/service/dialect/dorisDialect.ts`:

```typescript
import { MysqlDialect } from "./mysqlDialect";

export class DorisDialect extends MysqlDialect {
    createDatabase(database: string): string {
        return `CREATE DATABASE ${this.quoteIdentifier(database)}`;
    }

    showTables(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT TABLE_COMMENT \`comment\`, TABLE_NAME as \`name\`, TABLE_ROWS \`rows\`, NULL auto_increment, NULL \`row_format\`, DATA_LENGTH data_length, INDEX_LENGTH index_length
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = '${schema}' AND TABLE_TYPE <> 'VIEW'
ORDER BY TABLE_NAME;`;
    }

    showViews(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT TABLE_NAME name
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = '${schema}'
ORDER BY TABLE_NAME;`;
    }

    showColumns(database: string, table: string): string {
        const schema = this.quoteLiteral(database);
        const tableName = this.quoteLiteral(table);
        return `SELECT COLUMN_NAME name, DATA_TYPE simpleType, DATA_TYPE type, COLUMN_COMMENT comment, COLUMN_KEY \`key\`, IS_NULLABLE nullable, CHARACTER_MAXIMUM_LENGTH maxLength, COLUMN_DEFAULT defaultValue, EXTRA extra
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${tableName}'
ORDER BY ORDINAL_POSITION;`;
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    id BIGINT NOT NULL COMMENT 'primary key',
    create_time DATETIME COMMENT 'create time',
    update_time DATETIME COMMENT 'update time',
    [column] VARCHAR(255) COMMENT ''
)
ENGINE=OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 10
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1"
);`;
    }

    private quoteIdentifier(identifier: string): string {
        return `\`${String(identifier || "").replace(/`/g, "``")}\``;
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }
}
```

- [ ] **Step 5: Register Doris services**

In `src/service/serviceManager.ts`, add the import:

```typescript
import { DorisDialect } from "./dialect/dorisDialect";
```

Update `getDumpService()`:

```typescript
            case DatabaseType.MYSQL:
                return new MysqlDumpService()
            case DatabaseType.DORIS:
                return new MysqlDumpService()
            case DatabaseType.KINGBASE:
                return new KingbaseDumpService()
```

Update `getImportService()`:

```typescript
            case DatabaseType.DORIS:
                return new MysqlImportService();
            case DatabaseType.MSSQL:
                return new SqlServerImportService()
```

Update `getDialect()`:

```typescript
            case DatabaseType.CLICKHOUSE:
                return new ClickHouseDialect();
            case DatabaseType.DORIS:
                return new DorisDialect();
            case DatabaseType.DUCKDB:
                return new DuckDBDialect();
```

Update `getPageService()`:

```typescript
            case DatabaseType.CLICKHOUSE:
                return new PostgreSqlPageService();
            case DatabaseType.DORIS:
                return new MysqlPageSerivce();
            case DatabaseType.DUCKDB:
                return new PostgreSqlPageService();
```

- [ ] **Step 6: Run focused service and dialect tests**

Run:

```powershell
node test/dorisDialect.test.js
node test/dorisServiceIntegration.test.js
```

Expected: both pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/service/dialect/dorisDialect.ts src/service/serviceManager.ts test/dorisDialect.test.js test/dorisServiceIntegration.test.js
git commit -m "feat: add doris dialect services"
```

---

### Task 3: Wire Doris SQL Tree and Model Semantics

**Files:**
- Modify: `src/provider/treeDataProvider.ts`
- Modify: `src/model/database/connectionNode.ts`
- Modify: `src/model/database/schemaNode.ts`
- Modify: `src/model/main/tableGroup.ts`
- Modify: `src/model/main/tableNode.ts`
- Test: `test/dorisRegistration.test.js`

**Interfaces:**
- Consumes: `DatabaseType.DORIS`.
- Produces: Doris is stored in `CacheKey.DATBASE_CONECTIONS`.
- Produces: Doris connection expands as `connection -> database/schema -> table/view`, with no catalog node.
- Produces: Doris table pin/filter state uses the same key shape as MySQL, Oracle, Dameng, and ClickHouse.
- Produces: Doris table source uses `SHOW CREATE TABLE`.

- [ ] **Step 1: Write registration test**

Create `test/dorisRegistration.test.js`:

```javascript
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const constants = read("src/common/constants.ts");
assert.match(constants, /DORIS\s*=\s*"Doris"/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /DorisConnection/);
assert.match(connectionManager, /case DatabaseType\.DORIS:[\s\S]*new DorisConnection/);

const serviceManager = read("src/service/serviceManager.ts");
assert.match(serviceManager, /DorisDialect/);
assert.match(serviceManager, /case DatabaseType\.DORIS:[\s\S]*new DorisDialect/);
assert.match(serviceManager, /case DatabaseType\.DORIS:[\s\S]*new MysqlPageSerivce/);
assert.match(serviceManager, /case DatabaseType\.DORIS:[\s\S]*new MysqlImportService/);
assert.match(serviceManager, /case DatabaseType\.DORIS:[\s\S]*new MysqlDumpService/);

const treeProvider = read("src/provider/treeDataProvider.ts");
const getKeyBlock = treeProvider.match(/private getKeyByNode[\s\S]*?return CacheKey\.DATBASE_CONECTIONS;/)[0];
assert.doesNotMatch(getKeyBlock, /DatabaseType\.DORIS/);
assert.match(treeProvider, /DatabaseType\.SQLITE \|\| cNode\.dbType == DatabaseType\.DUCKDB/);

const connectionNode = read("src/model/database/connectionNode.ts");
assert.match(connectionNode, /icon\/doris\.svg/);
assert.match(connectionNode, /this\.dbType != DatabaseType\.DORIS/);
assert.match(connectionNode, /DatabaseType\.DORIS[\s\S]*\? databaseNode\.schema/);

const schemaNode = read("src/model/database/schemaNode.ts");
assert.match(schemaNode, /DatabaseType\.MYSQL \|\| this\.dbType == DatabaseType\.DORIS/);

const tableGroup = read("src/model/main/tableGroup.ts");
assert.match(tableGroup, /DatabaseType\.DORIS/);
assert.match(tableGroup, /DatabaseType\.MYSQL \|\| parent\.dbType == DatabaseType\.ORACLE \|\| parent\.dbType == DatabaseType\.DAMENG \|\| parent\.dbType == DatabaseType\.CLICKHOUSE \|\| parent\.dbType == DatabaseType\.DORIS/);

const tableNode = read("src/model/main/tableNode.ts");
assert.match(tableNode, /DatabaseType\.MYSQL \|\| this\.dbType == DatabaseType\.SQLITE \|\| this\.dbType == DatabaseType\.DORIS/);

console.log("dorisRegistration tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node test/dorisRegistration.test.js
```

Expected: FAIL until model and tree files include Doris.

- [ ] **Step 3: Keep Doris in the SQL tree**

In `src/provider/treeDataProvider.ts`, do not add Doris to the NoSQL condition:

```typescript
        if (dbType == DatabaseType.ES || dbType == DatabaseType.REDIS || dbType == DatabaseType.KAFKA || dbType == DatabaseType.RABBITMQ || dbType == DatabaseType.SSH || dbType == DatabaseType.FTP || dbType == DatabaseType.MONGO_DB) {
            return CacheKey.NOSQL_CONNECTION;
        }
        return CacheKey.DATBASE_CONECTIONS;
```

No code change is needed for this method if it already matches the snippet. The registration test protects the behavior.

- [ ] **Step 4: Update ConnectionNode**

In `src/model/database/connectionNode.ts`, add Doris icon handling:

```typescript
        } else if (this.dbType == DatabaseType.CLICKHOUSE) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/clickhouse.svg");
        } else if (this.dbType == DatabaseType.DORIS) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/doris.svg");
        } else if (this.dbType == DatabaseType.ORACLE) {
            this.iconPath = new vscode.ThemeIcon("database");
```

Update the catalog decision so Doris behaves like MySQL-style database listing:

```typescript
        const hasCatalog = this.dbType != DatabaseType.MYSQL
            && this.dbType != DatabaseType.ORACLE
            && this.dbType != DatabaseType.DAMENG
            && this.dbType != DatabaseType.CLICKHOUSE
            && this.dbType != DatabaseType.DORIS
            && this.contextValue == ModelType.CONNECTION;
```

Update `newQuery()` database name selection:

```typescript
            return (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.ORACLE || this.dbType == DatabaseType.DAMENG || this.dbType == DatabaseType.CLICKHOUSE || this.dbType == DatabaseType.DORIS)
                ? databaseNode.schema
                : databaseNode.database;
```

- [ ] **Step 5: Update SchemaNode icon semantics**

In `src/model/database/schemaNode.ts`, change `getIcon()`:

```typescript
        const iconId = this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.DORIS ? "database" : "symbol-struct"
```

- [ ] **Step 6: Update TableGroup state handling**

In `src/model/main/tableGroup.ts`, add Doris to the schema-style branch in the constructor:

```typescript
        if (parent.dbType == DatabaseType.MYSQL || parent.dbType == DatabaseType.ORACLE || parent.dbType == DatabaseType.DAMENG || parent.dbType == DatabaseType.CLICKHOUSE || parent.dbType == DatabaseType.DORIS) {
```

Add Doris to the same branch in the cloud update path:

```typescript
            if (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.ORACLE || this.dbType == DatabaseType.DAMENG || this.dbType == DatabaseType.CLICKHOUSE || this.dbType == DatabaseType.DORIS) {
```

Add Doris to the same branch in the local update path:

```typescript
            if (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.ORACLE || this.dbType == DatabaseType.DAMENG || this.dbType == DatabaseType.CLICKHOUSE || this.dbType == DatabaseType.DORIS) {
```

- [ ] **Step 7: Use SHOW CREATE TABLE for Doris**

In `src/model/main/tableNode.ts`, change the `showSource()` branch:

```typescript
        if (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.SQLITE || this.dbType == DatabaseType.DORIS) {
            const sourceResule = await this.execute<any[]>(this.dialect.showTableSource(this.schema, this.table))
            sql = sourceResule[0]['Create Table'];
            if (this.dbType == DatabaseType.SQLITE) {
                sql = sql.replace(/\\n/g, '\n');
            }
        } else {
```

- [ ] **Step 8: Run registration test**

Run:

```powershell
node test/dorisRegistration.test.js
```

Expected: PASS and prints `dorisRegistration tests passed`.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/provider/treeDataProvider.ts src/model/database/connectionNode.ts src/model/database/schemaNode.ts src/model/main/tableGroup.ts src/model/main/tableNode.ts test/dorisRegistration.test.js
git commit -m "feat: wire doris sql tree"
```

---

### Task 4: Add Doris Connection UI and Logo

**Files:**
- Create: `resources/icon/doris.svg`
- Modify: `src/vue/connect/index.vue`
- Test: `test/dorisUiConfig.test.js`

**Interfaces:**
- Produces: Doris database selector entry.
- Produces: `dbLogoMap.Doris` using `resources/icon/doris.svg`.
- Produces: defaults `root`, `9030`, empty password, empty database, SSL off.
- Produces: Doris is eligible for existing SSL fields.

- [ ] **Step 1: Write UI config test**

Create `test/dorisUiConfig.test.js`:

```javascript
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const connect = read("src/vue/connect/index.vue");

assert.match(connect, /Doris:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/doris\.svg"\)/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"ClickHouse",\s*"Doris",\s*"DuckDB"/);
assert.match(connect, /connectionOption\.dbType == 'Doris' \|\|[\s\S]*connectionOption\.dbType == 'ClickHouse'/);
assert.match(connect, /\[[^\]]*'MySQL'[^\]]*'Doris'[^\]]*'ClickHouse'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /case "Doris":[\s\S]*this\.connectionOption\.user = "root";[\s\S]*this\.connectionOption\.password = "";[\s\S]*this\.connectionOption\.port = 9030;[\s\S]*this\.connectionOption\.database = "";[\s\S]*this\.connectionOption\.useSSL = false;/);

const logo = read("resources/icon/doris.svg");
assert.match(logo, /<svg/);
assert.match(logo, /Doris/);

console.log("dorisUiConfig tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node test/dorisUiConfig.test.js
```

Expected: FAIL until the UI and icon are added.

- [ ] **Step 3: Add Doris SVG logo**

Create `resources/icon/doris.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Doris">
  <rect width="64" height="64" rx="10" fill="#0f766e"/>
  <path d="M14 18h18c11 0 18 6 18 14s-7 14-18 14H14V18z" fill="#ffffff"/>
  <path d="M24 27h8c4 0 7 2 7 5s-3 5-7 5h-8V27z" fill="#0f766e"/>
  <path d="M13 49h38v5H13z" fill="#99f6e4"/>
</svg>
```

- [ ] **Step 4: Add Doris logo metadata**

In `src/vue/connect/index.vue`, add Doris to `dbLogoMap` after ClickHouse:

```javascript
  Doris: {
    icon: require("@/../resources/icon/doris.svg"),
    text: "DO",
    bg: "#ecfdf5",
    color: "#0f766e",
  },
```

- [ ] **Step 5: Add Doris selector entry**

In `supportDatabases`, add Doris between ClickHouse and DuckDB:

```javascript
        "ClickHouse",
        "Doris",
        "DuckDB",
```

- [ ] **Step 6: Add Doris to SSL UI visibility**

In the `Use SSL` switch condition, add Doris near MySQL and ClickHouse:

```vue
          connectionOption.dbType == 'MySQL' ||
          connectionOption.dbType == 'Doris' ||
          connectionOption.dbType == 'PostgreSQL' ||
          connectionOption.dbType == 'ClickHouse' ||
```

In the `<SSL>` component visibility list, add Doris:

```vue
        ['MySQL', 'Doris', 'PostgreSQL', 'ClickHouse', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch', 'Kafka', 'RabbitMQ'].includes(connectionOption.dbType)
```

- [ ] **Step 7: Add Doris defaults**

In the `connectionOption.dbType` watcher, add:

```javascript
        case "Doris":
          this.connectionOption.user = "root";
          this.connectionOption.password = "";
          this.connectionOption.port = 9030;
          this.connectionOption.database = "";
          this.connectionOption.useSSL = false;
          break;
```

- [ ] **Step 8: Run UI test**

Run:

```powershell
node test/dorisUiConfig.test.js
```

Expected: PASS and prints `dorisUiConfig tests passed`.

- [ ] **Step 9: Commit**

Run:

```powershell
git add resources/icon/doris.svg src/vue/connect/index.vue test/dorisUiConfig.test.js
git commit -m "feat: add doris connection ui"
```

---

### Task 5: Focused Verification

**Files:**
- No required source files unless verification reveals a defect.

**Interfaces:**
- Consumes all Doris tasks.
- Produces a buildable extension with focused Doris coverage.

- [ ] **Step 1: Run Doris focused tests**

Run:

```powershell
node test/dorisConnection.test.js
node test/dorisDialect.test.js
node test/dorisServiceIntegration.test.js
node test/dorisRegistration.test.js
node test/dorisUiConfig.test.js
```

Expected:

- `dorisConnection tests passed`
- `dorisDialect tests passed`
- `dorisServiceIntegration tests passed`
- `dorisRegistration tests passed`
- `dorisUiConfig tests passed`

- [ ] **Step 2: Run nearby regression tests**

Run:

```powershell
node test/multiBackendConnection.test.js
node test/multiBackendRegistration.test.js
node test/multiBackendUiConfig.test.js
node test/kingbaseServiceIntegration.test.js
node test/damengServiceIntegration.test.js
node test/tableFilterSql.test.js
```

Expected: all commands pass.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm run build
```

Expected: build succeeds. Existing webpack warnings about dynamic requires, optional dependencies, or bundle size can remain if they are already present before Doris work.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short --branch
```

Expected: no uncommitted files beyond deliberate Doris source, test, and logo changes already committed by earlier tasks.

- [ ] **Step 5: Manual smoke against a Doris FE**

Use a Doris FE MySQL protocol endpoint:

1. Open the connection page.
2. Select `Doris`.
3. Confirm defaults: host `127.0.0.1`, port `9030`, user `root`, password empty, database empty.
4. Save and open the connection.
5. Confirm the connection appears in the SQL tree, not NoSQL.
6. Expand the connection and confirm Doris databases appear directly under it.
7. Expand a database and confirm table and view groups load.
8. Open a table and confirm table data loads.
9. Open query workspace and run:

```sql
SELECT 1;
```

Expected: result grid shows one row.

10. Use Create Table template from the table group.

Expected: template includes `ENGINE=OLAP`, `DUPLICATE KEY`, `DISTRIBUTED BY HASH`, and `PROPERTIES`.

- [ ] **Step 6: Commit verification fixes**

If verification required a fix, stage only the files touched by that fix and commit with:

```powershell
git add src/common/constants.ts src/service/connect/dorisConnection.ts src/service/dialect/dorisDialect.ts src/service/connectionManager.ts src/service/serviceManager.ts src/provider/treeDataProvider.ts src/model/database/connectionNode.ts src/model/database/schemaNode.ts src/model/main/tableGroup.ts src/model/main/tableNode.ts src/vue/connect/index.vue resources/icon/doris.svg test/dorisConnection.test.js test/dorisDialect.test.js test/dorisServiceIntegration.test.js test/dorisRegistration.test.js test/dorisUiConfig.test.js
git commit -m "fix: stabilize doris support"
```

If verification required no fix, do not create an empty commit.

---

## Self-Review

- Spec coverage: Doris SQL type is covered by Task 1; Doris MySQL-protocol connection is covered by Task 1; Doris-safe metadata and template SQL are covered by Task 2; SQL tree and table/query behavior are covered by Task 3; connection page defaults and logo are covered by Task 4; automated and manual verification are covered by Task 5.
- Placeholder scan: no task contains unresolved placeholder markers, undefined file names, or deferred implementation instructions.
- Type consistency: `DatabaseType.DORIS`, `DorisConnection`, `DorisDialect`, `MysqlPageSerivce`, `MysqlImportService`, and `MysqlDumpService` names match across tasks.

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-07-11-doris-support.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
