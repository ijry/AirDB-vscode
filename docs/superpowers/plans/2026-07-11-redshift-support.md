# Amazon Redshift Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Amazon Redshift as a first-class SQL backend with connection creation, SQL tree browsing, table/query usage, and Redshift-safe metadata SQL.

**Architecture:** Redshift is modeled as a SQL database type under the existing SQL tree. It reuses the existing `pg` dependency through a dedicated `RedshiftConnection`, routes metadata through a dedicated `RedshiftDialect`, and reuses PostgreSQL pagination and SQL import services without adding AWS API, Data API, IAM, COPY, or UNLOAD workflows.

**Tech Stack:** TypeScript, Vue 2 connection webview, existing `pg` driver, existing SQL tree/query/page services, Node-based smoke tests.

## Global Constraints

- Add `DatabaseType.REDSHIFT = "Redshift"`.
- Redshift must appear in `activitybar.airdb.sql`, not the NoSQL tree.
- Do not add a runtime dependency for Redshift.
- Use the existing `pg` dependency for SQL sessions.
- Default host must be `127.0.0.1`.
- Default port must be `5439`.
- Default user must be `awsuser`.
- Default database must be `dev`.
- Default SSL must be enabled.
- Reuse `PostgreSqlPageService` for pagination.
- Reuse `PostgresqlImortService` for SQL script import.
- Keep generic `DumpService` behavior for Redshift in this version.
- Do not implement Redshift Data API, IAM database authentication, temporary credentials, AWS Secrets Manager integration, COPY, UNLOAD, Spectrum, S3 import/export workflows, AWS cluster discovery, privilege management, workload management, or cluster administration panels.
- Tests must not require a live Redshift cluster.

---

## File Structure

- Modify `src/common/constants.ts`: add `DatabaseType.REDSHIFT` beside PostgreSQL-derived SQL engines.
- Modify `src/service/connect/postgreSqlConnection.ts`: expose a protected constructor seam for tests to capture normalized config without changing runtime behavior.
- Create `src/service/connect/redshiftConnection.ts`: normalize Redshift defaults and extend `PostgreSqlConnection`.
- Modify `src/service/connectionManager.ts`: instantiate `RedshiftConnection` for Redshift nodes.
- Create `src/service/dialect/redshiftDialect.ts`: extend `PostgreSqlDialect` with Redshift-safe metadata SQL and templates.
- Modify `src/service/serviceManager.ts`: route Redshift dialect, page service, and import service.
- Modify `src/model/database/connectionNode.ts`: add Redshift tree icon and treat Redshift as PostgreSQL-style catalog/schema hierarchy.
- Modify `src/model/database/schemaNode.ts`: treat Redshift schema drop target like PostgreSQL schema.
- Modify `src/model/main/tableGroup.ts`: treat Redshift pinned-table and filter state like PostgreSQL/Kingbase catalog-schema state.
- Create `resources/icon/redshift.svg`: SVG logo used by the tree and connection page.
- Modify `src/vue/connect/index.vue`: add Redshift logo, selector item, defaults, SSL toggle, and SSL certificate form support.
- Add `test/redshiftRegistration.test.js`: static registration and tree routing coverage.
- Add `test/redshiftConnection.test.js`: connection inheritance and default normalization coverage.
- Add `test/redshiftDialect.test.js`: Redshift metadata SQL and template coverage.
- Add `test/redshiftServiceIntegration.test.js`: service manager runtime routing coverage.
- Add `test/redshiftUiConfig.test.js`: connection UI and icon coverage.

---

### Task 1: Redshift Type And Connection Registration

**Files:**
- Modify: `src/common/constants.ts`
- Modify: `src/service/connect/postgreSqlConnection.ts`
- Create: `src/service/connect/redshiftConnection.ts`
- Modify: `src/service/connectionManager.ts`
- Test: `test/redshiftRegistration.test.js`
- Test: `test/redshiftConnection.test.js`

**Interfaces:**
- Produces: `DatabaseType.REDSHIFT = "Redshift"`.
- Produces: `RedshiftConnection extends PostgreSqlConnection`.
- Produces: `RedshiftConnection.normalizeNode(node: Node): Node`.
- Produces: `PostgreSqlConnection.createClient(config: ClientConfig): Client` protected factory method.
- Consumes: existing `ConnectionManager.create(opt: Node)` switch.

- [ ] **Step 1: Write the failing static registration test**

Create `test/redshiftRegistration.test.js`:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const constants = read("src/common/constants.ts");
assert.match(constants, /REDSHIFT\s*=\s*"Redshift"/);

const connectionManager = read("src/service/connectionManager.ts");
assert.match(connectionManager, /RedshiftConnection/);
assert.match(connectionManager, /case DatabaseType\.REDSHIFT:[\s\S]*new RedshiftConnection/);

const postgreSqlConnection = read("src/service/connect/postgreSqlConnection.ts");
assert.match(postgreSqlConnection, /protected createClient\(config: ClientConfig\): Client/);
assert.match(postgreSqlConnection, /this\.client = this\.createClient\(config\)/);

const redshiftConnection = read("src/service/connect/redshiftConnection.ts");
assert.match(redshiftConnection, /export class RedshiftConnection extends PostgreSqlConnection/);
assert.match(redshiftConnection, /static normalizeNode\(node: Node\): Node/);
assert.match(redshiftConnection, /port: node\.port \|\| 5439/);
assert.match(redshiftConnection, /database: node\.database \|\| "dev"/);
assert.match(redshiftConnection, /user: node\.user \|\| "awsuser"/);
assert.match(redshiftConnection, /useSSL: node\.useSSL == null \? true : node\.useSSL/);

const treeProvider = read("src/provider/treeDataProvider.ts");
const getKeyBlock = treeProvider.match(/private getKeyByNode[\s\S]*?return CacheKey\.DATBASE_CONECTIONS;/)[0];
assert.doesNotMatch(getKeyBlock, /DatabaseType\.REDSHIFT/);

console.log("redshiftRegistration tests passed");
```

- [ ] **Step 2: Run the failing static registration test**

Run:

```powershell
node test\redshiftRegistration.test.js
```

Expected: FAIL because `REDSHIFT`, `RedshiftConnection`, and the PostgreSQL connection factory method are missing.

- [ ] **Step 3: Write the failing connection test**

Create `test/redshiftConnection.test.js`:

```js
const assert = require("assert");
const { requireTs } = require("./testSetup");

const pgPath = require.resolve("pg");
const pgConfigs = [];
class FakeClient {
  constructor(config) {
    pgConfigs.push(config);
    this._connected = true;
    this._ending = false;
    this._queryable = true;
  }
  query() {}
  connect(callback) { callback && callback(null); }
  end() {}
  on() {}
}
require.cache[pgPath] = {
  id: pgPath,
  filename: pgPath,
  loaded: true,
  exports: {
    Client: FakeClient,
    types: { setTypeParser() {} },
  },
};

const { RedshiftConnection } = requireTs("src/service/connect/redshiftConnection.ts");
const { PostgreSqlConnection } = requireTs("src/service/connect/postgreSqlConnection.ts");

assert.strictEqual(
  Object.getPrototypeOf(RedshiftConnection.prototype),
  PostgreSqlConnection.prototype
);

const explicit = new RedshiftConnection({
  host: "example.redshift.amazonaws.com",
  port: 5440,
  user: "analytics_user",
  password: "secret",
  database: "analytics",
  dbType: "Redshift",
  useSSL: false,
  connectTimeout: 7000,
  requestTimeout: 11000,
});
assert(explicit instanceof PostgreSqlConnection);
assert(explicit instanceof RedshiftConnection);
assert.strictEqual(pgConfigs[0].host, "example.redshift.amazonaws.com");
assert.strictEqual(pgConfigs[0].port, 5440);
assert.strictEqual(pgConfigs[0].user, "analytics_user");
assert.strictEqual(pgConfigs[0].database, "analytics");
assert.strictEqual(pgConfigs[0].ssl, undefined);
assert.strictEqual(pgConfigs[0].connectionTimeoutMillis, 7000);
assert.strictEqual(pgConfigs[0].statement_timeout, 11000);

new RedshiftConnection({
  host: "example.redshift.amazonaws.com",
  password: "secret",
  dbType: "Redshift",
});
assert.strictEqual(pgConfigs[1].port, 5439);
assert.strictEqual(pgConfigs[1].user, "awsuser");
assert.strictEqual(pgConfigs[1].database, "dev");
assert.deepStrictEqual(pgConfigs[1].ssl, {
  rejectUnauthorized: false,
  ca: null,
  cert: null,
  key: null,
});

assert.deepStrictEqual(RedshiftConnection.normalizeNode({ dbType: "Redshift" }), {
  dbType: "Redshift",
  port: 5439,
  database: "dev",
  user: "awsuser",
  useSSL: true,
});

console.log("redshiftConnection tests passed");
```

- [ ] **Step 4: Run the failing connection test**

Run:

```powershell
node test\redshiftConnection.test.js
```

Expected: FAIL because `src/service/connect/redshiftConnection.ts` does not exist.

- [ ] **Step 5: Add the Redshift database type**

In `src/common/constants.ts`, update the `DatabaseType` enum:

```ts
export enum DatabaseType {
    MYSQL = "MySQL", PG = "PostgreSQL", REDSHIFT = "Redshift", KINGBASE = "KingbaseES", DAMENG = "Dameng", SQLITE = "SQLite",
    MSSQL = "SqlServer", ORACLE = "Oracle", MONGO_DB="MongoDB",
    CLICKHOUSE = "ClickHouse", DORIS = "Doris", DUCKDB = "DuckDB",
    ES = "ElasticSearch", REDIS = "Redis", KAFKA = "Kafka", RABBITMQ = "RabbitMQ", S3 = "S3", SSH="SSH",FTP="FTP"
}
```

- [ ] **Step 6: Add a protected client factory to PostgreSqlConnection**

In `src/service/connect/postgreSqlConnection.ts`, replace direct client construction:

```ts
        this.client = new Client(config);
```

with:

```ts
        this.client = this.createClient(config);
```

Add this method inside `PostgreSqlConnection`, after the constructor:

```ts
    protected createClient(config: ClientConfig): Client {
        return new Client(config);
    }
```

Expected behavior: runtime construction is unchanged, while tests and subclasses can observe normalized `ClientConfig` through the same path.

- [ ] **Step 7: Create the Redshift connection class**

Create `src/service/connect/redshiftConnection.ts`:

```ts
import { Node } from "@/model/interface/node";
import { PostgreSqlConnection } from "./postgreSqlConnection";

export class RedshiftConnection extends PostgreSqlConnection {
    constructor(node: Node) {
        super(RedshiftConnection.normalizeNode(node));
    }

    public static normalizeNode(node: Node): Node {
        return {
            ...node,
            port: node.port || 5439,
            database: node.database || "dev",
            user: node.user || "awsuser",
            useSSL: node.useSSL == null ? true : node.useSSL,
        } as Node;
    }
}
```

- [ ] **Step 8: Register Redshift in the connection manager**

In `src/service/connectionManager.ts`, add:

```ts
import { RedshiftConnection } from "./connect/redshiftConnection";
```

Add the switch case immediately after PostgreSQL:

```ts
            case DatabaseType.REDSHIFT:
                return new RedshiftConnection(opt)
```

- [ ] **Step 9: Run focused registration and connection tests**

Run:

```powershell
node test\redshiftRegistration.test.js
node test\redshiftConnection.test.js
```

Expected: both tests pass.

- [ ] **Step 10: Commit Task 1**

Run:

```powershell
git add src\common\constants.ts src\service\connect\postgreSqlConnection.ts src\service\connect\redshiftConnection.ts src\service\connectionManager.ts test\redshiftRegistration.test.js test\redshiftConnection.test.js
git commit -m "feat: register redshift connection type"
```

---

### Task 2: Redshift Dialect, Services, And SQL Tree Behavior

**Files:**
- Create: `src/service/dialect/redshiftDialect.ts`
- Modify: `src/service/serviceManager.ts`
- Modify: `src/model/database/connectionNode.ts`
- Modify: `src/model/database/schemaNode.ts`
- Modify: `src/model/main/tableGroup.ts`
- Test: `test/redshiftDialect.test.js`
- Test: `test/redshiftServiceIntegration.test.js`
- Modify: `test/redshiftRegistration.test.js`

**Interfaces:**
- Consumes: `DatabaseType.REDSHIFT` and `RedshiftConnection` from Task 1.
- Produces: `RedshiftDialect extends PostgreSqlDialect`.
- Produces: `ServiceManager.getDialect(DatabaseType.REDSHIFT): RedshiftDialect`.
- Produces: `ServiceManager.getPageService(DatabaseType.REDSHIFT): PostgreSqlPageService`.
- Produces: `ServiceManager.getImportService(DatabaseType.REDSHIFT): PostgresqlImortService`.
- Produces: Redshift tree behavior matching PostgreSQL catalog/schema hierarchy.

- [ ] **Step 1: Write the failing dialect test**

Create `test/redshiftDialect.test.js`:

```js
const assert = require("assert");
const { requireTs } = require("./testSetup");

const { RedshiftDialect } = requireTs("src/service/dialect/redshiftDialect.ts");
const { PostgreSqlDialect } = requireTs("src/service/dialect/postgreSqlDialect.ts");

const dialect = new RedshiftDialect();

assert(dialect instanceof PostgreSqlDialect);
assert.strictEqual(dialect.createDatabase("analytics"), 'create database "analytics"');
assert.strictEqual(dialect.pingDataBase("analytics"), "set schema 'analytics';");
assert.strictEqual(dialect.pingDataBase(""), "select 1");

assert.match(dialect.showDatabases(), /SELECT datname "Database" FROM pg_database/i);
assert.match(dialect.showDatabases(), /datistemplate = false/);
assert.match(dialect.showDatabases(), /ORDER BY datname/);

assert.match(dialect.showSchemas(), /information_schema\.schemata/i);
assert.match(dialect.showSchemas(), /catalog_name "Database"/);
assert.match(dialect.showSchemas(), /schema_name "schema"/);
assert.match(dialect.showSchemas(), /schema_name NOT IN \('pg_catalog', 'information_schema'\)/);

assert.match(dialect.showTables("public"), /information_schema\.tables/i);
assert.match(dialect.showTables("public"), /table_schema = 'public'/);
assert.match(dialect.showTables("public"), /table_type = 'BASE TABLE'/);
assert.match(dialect.showTables("public"), /table_name "name"/);
assert.doesNotMatch(dialect.showTables("public"), /pg_catalog\.obj_description/);

assert.match(dialect.showViews("public"), /information_schema\.views/i);
assert.match(dialect.showViews("public"), /table_schema = 'public'/);
assert.match(dialect.showViews("public"), /table_name "name"/);

assert.match(dialect.showColumns("public", "orders"), /information_schema\.columns/i);
assert.match(dialect.showColumns("public", "orders"), /column_name "name"/);
assert.match(dialect.showColumns("public", "orders"), /data_type "simpleType"/);
assert.match(dialect.showColumns("public", "orders"), /table_schema = 'public'/);
assert.match(dialect.showColumns("public", "orders"), /table_name = 'orders'/);

assert.strictEqual(dialect.showTableSource("public", "orders"), "");
assert.match(dialect.tableTemplate(), /IDENTITY\(1,1\)/);
assert.match(dialect.tableTemplate(), /DISTSTYLE AUTO/);
assert.match(dialect.tableTemplate(), /SORTKEY/);
assert.doesNotMatch(dialect.tableTemplate(), /SERIAL/);
assert.match(dialect.procedureTemplate(), /LANGUAGE plpgsql/);
assert.match(dialect.functionTemplate(), /LANGUAGE SQL/);

console.log("redshiftDialect tests passed");
```

- [ ] **Step 2: Run the failing dialect test**

Run:

```powershell
node test\redshiftDialect.test.js
```

Expected: FAIL because `RedshiftDialect` does not exist.

- [ ] **Step 3: Write the failing service integration test**

Create `test/redshiftServiceIntegration.test.js`:

```js
const assert = require("assert");
const path = require("path");
const { requireTs, root } = require("./testSetup");

function mockModule(relativePath, exports) {
  const filename = path.resolve(root, relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

class EmptyDisposableProvider {}
class MockRedshiftDialect {}
class MockPostgreSqlPageService {}
class MockPostgresqlImportService {}
class MockDumpService {}

mockModule("src/provider/treeDataProvider.ts", { DbTreeDataProvider: class DbTreeDataProvider {} });
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
mockModule("src/service/dialect/redshiftDialect.ts", { RedshiftDialect: MockRedshiftDialect });
mockModule("src/service/dump/dumpService.ts", { DumpService: MockDumpService });
mockModule("src/service/dump/mysqlDumpService.ts", { MysqlDumpService: EmptyDisposableProvider });
mockModule("src/service/import/mysqlImportService.ts", { MysqlImportService: EmptyDisposableProvider });
mockModule("src/service/import/postgresqlImortService.ts", { PostgresqlImortService: MockPostgresqlImportService });
mockModule("src/service/import/sqlServerImportService.ts", { SqlServerImportService: EmptyDisposableProvider });
mockModule("src/service/import/kingbaseImportService.ts", { KingbaseImportService: EmptyDisposableProvider });
mockModule("src/service/import/damengImportService.ts", { DamengImportService: EmptyDisposableProvider });
mockModule("src/service/dump/kingbaseDumpService.ts", { KingbaseDumpService: EmptyDisposableProvider });
mockModule("src/service/dump/damengDumpService.ts", { DamengDumpService: EmptyDisposableProvider });
mockModule("src/service/page/postgreSqlPageService.ts", { PostgreSqlPageService: MockPostgreSqlPageService });
mockModule("src/service/page/mysqlPageSerivce.ts", { MysqlPageSerivce: EmptyDisposableProvider });
mockModule("src/service/page/esPageService.ts", { EsPageService: EmptyDisposableProvider });
mockModule("src/service/page/mongoPageService.ts", { MongoPageService: EmptyDisposableProvider });
mockModule("src/service/page/damengPageService.ts", { DamengPageService: EmptyDisposableProvider });
mockModule("src/service/common/historyRecorder.ts", { HistoryRecorder: EmptyDisposableProvider });
mockModule("src/service/common/databaseCache.ts", { DatabaseCache: { initCache() {}, storeElementState() {} } });
mockModule("src/common/filesManager.ts", { FileManager: { init() {} } });
mockModule("src/common/viewManager.ts", { ViewManager: { initExtesnsionPath() {} } });
mockModule("src/common/Console.ts", { Console: { log() {} } });
mockModule("src/service/status/statusService.ts", { StatusService: EmptyDisposableProvider });

const globalPath = path.resolve(root, "src/common/global.ts");
require.cache[globalPath] = {
  id: globalPath,
  filename: globalPath,
  loaded: true,
  exports: {
    Global: class Global {
      static getExtPath() { return ""; }
      static getConfig(_key, defaultValue) { return defaultValue; }
    },
  },
};

const { DatabaseType } = requireTs("src/common/constants.ts");
const { ServiceManager } = requireTs("src/service/serviceManager.ts");
const { RedshiftDialect } = requireTs("src/service/dialect/redshiftDialect.ts");
const { PostgreSqlPageService } = requireTs("src/service/page/postgreSqlPageService.ts");
const { PostgresqlImortService } = requireTs("src/service/import/postgresqlImortService.ts");
const { DumpService } = requireTs("src/service/dump/dumpService.ts");

assert.strictEqual(DatabaseType.REDSHIFT, "Redshift");
assert(ServiceManager.getDialect(DatabaseType.REDSHIFT) instanceof RedshiftDialect);
assert(ServiceManager.getPageService(DatabaseType.REDSHIFT) instanceof PostgreSqlPageService);
assert(ServiceManager.getImportService(DatabaseType.REDSHIFT) instanceof PostgresqlImortService);
assert(ServiceManager.getDumpService(DatabaseType.REDSHIFT) instanceof DumpService);

console.log("redshiftServiceIntegration tests passed");
```

- [ ] **Step 4: Run the failing service integration test**

Run:

```powershell
node test\redshiftServiceIntegration.test.js
```

Expected: FAIL because `ServiceManager` does not route Redshift yet.

- [ ] **Step 5: Extend the static registration test for services and tree behavior**

Append these assertions to `test/redshiftRegistration.test.js` before the final `console.log`:

```js
const serviceManager = read("src/service/serviceManager.ts");
assert.match(serviceManager, /RedshiftDialect/);
assert.match(serviceManager, /case DatabaseType\.REDSHIFT:[\s\S]*new RedshiftDialect/);
assert.match(serviceManager, /case DatabaseType\.REDSHIFT:[\s\S]*new PostgreSqlPageService/);
assert.match(serviceManager, /case DatabaseType\.REDSHIFT:[\s\S]*new PostgresqlImortService/);

const connectionNode = read("src/model/database/connectionNode.ts");
assert.match(connectionNode, /icon\/redshift\.svg/);
assert.match(connectionNode, /this\.dbType == DatabaseType\.REDSHIFT[\s\S]*this\.iconPath/);

const schemaNode = read("src/model/database/schemaNode.ts");
assert.match(schemaNode, /DatabaseType\.MSSQL \|\| this\.dbType == DatabaseType\.PG \|\| this\.dbType == DatabaseType\.REDSHIFT \|\| this\.dbType == DatabaseType\.KINGBASE/);

const tableGroup = read("src/model/main/tableGroup.ts");
assert.match(tableGroup, /DatabaseType\.MSSQL \|\| parent\.dbType == DatabaseType\.PG \|\| parent\.dbType == DatabaseType\.REDSHIFT \|\| parent\.dbType == DatabaseType\.KINGBASE/);
assert.match(tableGroup, /this\.parent\.dbType == DatabaseType\.MSSQL \|\| this\.parent\.dbType == DatabaseType\.PG \|\| this\.parent\.dbType == DatabaseType\.REDSHIFT \|\| this\.parent\.dbType == DatabaseType\.KINGBASE/);
```

Run:

```powershell
node test\redshiftRegistration.test.js
```

Expected: FAIL because services and tree behavior are not wired yet.

- [ ] **Step 6: Create RedshiftDialect**

Create `src/service/dialect/redshiftDialect.ts`:

```ts
import { PostgreSqlDialect } from "./postgreSqlDialect";

export class RedshiftDialect extends PostgreSqlDialect {
    showDatabases() {
        return `SELECT datname "Database" FROM pg_database WHERE datistemplate = false ORDER BY datname;`;
    }

    showSchemas(): string {
        return `SELECT catalog_name "Database", schema_name "schema"
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
ORDER BY catalog_name, schema_name;`;
    }

    showTables(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT table_name "name", '' "comment"
FROM information_schema.tables
WHERE table_schema = '${schema}' AND table_type = 'BASE TABLE'
ORDER BY table_name;`;
    }

    showViews(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT table_name "name"
FROM information_schema.views
WHERE table_schema = '${schema}'
ORDER BY table_name;`;
    }

    showColumns(database: string, table: string): string {
        const schema = this.quoteLiteral(database);
        const tableName = this.quoteLiteral(table.split('.')[1] || table);
        return `SELECT column_name "name", data_type "simpleType", data_type "type", is_nullable nullable,
character_maximum_length "maxLength", column_default "defaultValue", '' "comment", '' "key"
FROM information_schema.columns
WHERE table_schema = '${schema}' AND table_name = '${tableName}'
ORDER BY ordinal_position;`;
    }

    showTableSource(_database: string, _table: string): string {
        return "";
    }

    tableTemplate(): string {
        return `CREATE TABLE [name](
    id BIGINT IDENTITY(1,1) NOT NULL,
    create_time TIMESTAMP,
    update_time TIMESTAMP,
    [column] VARCHAR(255)
)
DISTSTYLE AUTO
SORTKEY(create_time);`;
    }

    procedureTemplate(): string {
        return `CREATE PROCEDURE [name]()
LANGUAGE plpgsql
AS $$
BEGIN
    [content]
END;
$$;`;
    }

    functionTemplate(): string {
        return `CREATE FUNCTION [name]()
RETURNS [type]
STABLE
AS $$
    SELECT [value]::[type];
$$ LANGUAGE SQL;`;
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }
}
```

- [ ] **Step 7: Route Redshift services**

In `src/service/serviceManager.ts`, add:

```ts
import { RedshiftDialect } from "./dialect/redshiftDialect";
```

In `getImportService`, add:

```ts
            case DatabaseType.REDSHIFT:
                return new PostgresqlImortService();
```

In `getDialect`, add:

```ts
            case DatabaseType.REDSHIFT:
                return new RedshiftDialect();
```

In `getPageService`, add:

```ts
            case DatabaseType.REDSHIFT:
                return new PostgreSqlPageService();
```

Do not add Redshift to `getDumpService`; the default return remains `new DumpService()`.

- [ ] **Step 8: Wire Redshift into SQL tree behavior**

In `src/model/database/connectionNode.ts`, add the icon branch after PostgreSQL:

```ts
        if (this.dbType == DatabaseType.PG) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/pg_server.svg");
        } else if (this.dbType == DatabaseType.REDSHIFT) {
            this.iconPath = path.join(Constants.RES_PATH, "icon/redshift.svg");
        } else if (this.dbType == DatabaseType.KINGBASE) {
```

Keep Redshift out of the no-catalog exclusions:

```ts
        const hasCatalog = this.dbType != DatabaseType.MYSQL
            && this.dbType != DatabaseType.ORACLE
            && this.dbType != DatabaseType.DAMENG
            && this.dbType != DatabaseType.CLICKHOUSE
            && this.dbType != DatabaseType.DORIS
            && this.contextValue == ModelType.CONNECTION;
```

- [ ] **Step 9: Treat Redshift schema actions like PostgreSQL**

In `src/model/database/schemaNode.ts`, change the `dropDatatabase()` target expression:

```ts
        const target = this.dbType == DatabaseType.ORACLE || this.dbType == DatabaseType.DAMENG
            ? 'user'
            : (this.dbType == DatabaseType.MSSQL || this.dbType == DatabaseType.PG || this.dbType == DatabaseType.REDSHIFT || this.dbType == DatabaseType.KINGBASE ? 'schema' : 'database');
```

- [ ] **Step 10: Treat Redshift pinned-table state like PostgreSQL**

In `src/model/main/tableGroup.ts`, add `DatabaseType.REDSHIFT` to every PostgreSQL-style branch.

Constructor branch:

```ts
        } else if(parent.dbType == DatabaseType.MSSQL || parent.dbType == DatabaseType.PG || parent.dbType == DatabaseType.REDSHIFT || parent.dbType == DatabaseType.KINGBASE) {
```

Cloud update branch:

```ts
            } else if(this.parent.dbType == DatabaseType.MSSQL || this.parent.dbType == DatabaseType.PG || this.parent.dbType == DatabaseType.REDSHIFT || this.parent.dbType == DatabaseType.KINGBASE) {
```

Local update branch:

```ts
            } else if(this.parent.dbType == DatabaseType.MSSQL || this.parent.dbType == DatabaseType.PG || this.parent.dbType == DatabaseType.REDSHIFT || this.parent.dbType == DatabaseType.KINGBASE) {
```

- [ ] **Step 11: Run focused dialect, service, and registration tests**

Run:

```powershell
node test\redshiftDialect.test.js
node test\redshiftServiceIntegration.test.js
node test\redshiftRegistration.test.js
```

Expected: all three tests pass.

- [ ] **Step 12: Commit Task 2**

Run:

```powershell
git add src\service\dialect\redshiftDialect.ts src\service\serviceManager.ts src\model\database\connectionNode.ts src\model\database\schemaNode.ts src\model\main\tableGroup.ts test\redshiftDialect.test.js test\redshiftServiceIntegration.test.js test\redshiftRegistration.test.js
git commit -m "feat: add redshift dialect and services"
```

---

### Task 3: Redshift Connection UI And Icon

**Files:**
- Modify: `src/vue/connect/index.vue`
- Create: `resources/icon/redshift.svg`
- Test: `test/redshiftUiConfig.test.js`

**Interfaces:**
- Consumes: `DatabaseType.REDSHIFT = "Redshift"` and `resources/icon/redshift.svg` tree usage from Tasks 1-2.
- Produces: Redshift selector entry with logo.
- Produces: Redshift default connection options in the `connectionOption.dbType` watcher.
- Produces: Redshift SSL toggle and SSL certificate component support.

- [ ] **Step 1: Write the failing UI config test**

Create `test/redshiftUiConfig.test.js`:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const connect = read("src/vue/connect/index.vue");

assert.match(connect, /Redshift:\s*\{[\s\S]*icon: require\("@\/\.\.\/resources\/icon\/redshift\.svg"\)/);
assert.match(connect, /supportDatabases:\s*\[[\s\S]*"PostgreSQL",\s*"Redshift"/);
assert.match(connect, /\[[^\]]*'PostgreSQL'[^\]]*'Redshift'[^\]]*\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /\['MySQL', 'Doris', 'PostgreSQL', 'Redshift', 'ClickHouse', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch', 'Kafka', 'RabbitMQ'\]\.includes\(connectionOption\.dbType\)/);
assert.match(connect, /case "Redshift":[\s\S]*this\.connectionOption\.user = "awsuser";[\s\S]*this\.connectionOption\.password = "";[\s\S]*this\.connectionOption\.port = 5439;[\s\S]*this\.connectionOption\.database = "dev";[\s\S]*this\.connectionOption\.useSSL = true;[\s\S]*this\.connectionOption\.connectTimeout = 5000;[\s\S]*this\.connectionOption\.requestTimeout = 10000;/);

const logo = read("resources/icon/redshift.svg");
assert.match(logo, /<svg/);
assert.match(logo, /Redshift/);

console.log("redshiftUiConfig tests passed");
```

- [ ] **Step 2: Run the failing UI test**

Run:

```powershell
node test\redshiftUiConfig.test.js
```

Expected: FAIL because Redshift is not wired into the connection UI and icon assets.

- [ ] **Step 3: Create the Redshift SVG icon**

Create `resources/icon/redshift.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Redshift">
  <rect width="64" height="64" rx="10" fill="#5B2A86"/>
  <path d="M14 18 32 8l18 10v28L32 56 14 46V18Z" fill="#8C4CC2"/>
  <path d="M32 8v48L14 46V18L32 8Z" fill="#A56DE2"/>
  <path d="M32 8v48l18-10V18L32 8Z" fill="#47206A"/>
  <path d="M20 22h24v6H20v-6Zm0 10h24v6H20v-6Zm0 10h24v6H20v-6Z" fill="#F3E8FF"/>
  <text x="32" y="38" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" fill="#2A1240">RS</text>
</svg>
```

- [ ] **Step 4: Add Redshift logo and selector item**

In `src/vue/connect/index.vue`, add `Redshift` after `PostgreSQL` in `dbLogoMap`:

```js
  Redshift: {
    icon: require("@/../resources/icon/redshift.svg"),
    text: "RS",
    bg: "#f5edff",
    color: "#6d28d9",
  },
```

Add `"Redshift"` after `"PostgreSQL"` in `supportDatabases`:

```js
        "MySQL",
        "PostgreSQL",
        "Redshift",
        "ClickHouse",
```

- [ ] **Step 5: Add Redshift to SSL UI lists**

In the Use SSL switch list in `src/vue/connect/index.vue`, add `Redshift` after `PostgreSQL`:

```js
            'MySQL',
            'Doris',
            'PostgreSQL',
            'Redshift',
            'ClickHouse',
```

In the `SSL` component condition, use:

```vue
        ['MySQL', 'Doris', 'PostgreSQL', 'Redshift', 'ClickHouse', 'KingbaseES', 'MongoDB', 'Redis', 'ElasticSearch', 'Kafka', 'RabbitMQ'].includes(connectionOption.dbType)
```

- [ ] **Step 6: Add Redshift defaults in the database-type watcher**

In the `connectionOption.dbType` watcher in `src/vue/connect/index.vue`, add this case immediately after PostgreSQL:

```js
        case "Redshift":
          this.connectionOption.user = "awsuser";
          this.connectionOption.password = "";
          this.connectionOption.encrypt = false;
          this.connectionOption.port = 5439;
          this.connectionOption.database = "dev";
          this.connectionOption.useSSL = true;
          this.connectionOption.connectTimeout = 5000;
          this.connectionOption.requestTimeout = 10000;
          break;
```

- [ ] **Step 7: Run UI and static registration tests**

Run:

```powershell
node test\redshiftUiConfig.test.js
node test\redshiftRegistration.test.js
```

Expected: both tests pass.

- [ ] **Step 8: Commit Task 3**

Run:

```powershell
git add src\vue\connect\index.vue resources\icon\redshift.svg test\redshiftUiConfig.test.js
git commit -m "feat: add redshift connection ui"
```

---

### Task 4: Redshift Verification And Nearby Regressions

**Files:**
- Modify only Redshift implementation files needed to fix failures from this task.

**Interfaces:**
- Consumes: all Redshift interfaces from Tasks 1-3.
- Produces: focused Redshift tests passing, nearby backend regression tests passing, and production build passing.

- [ ] **Step 1: Run all focused Redshift tests**

Run:

```powershell
node test\redshiftRegistration.test.js
node test\redshiftConnection.test.js
node test\redshiftDialect.test.js
node test\redshiftServiceIntegration.test.js
node test\redshiftUiConfig.test.js
```

Expected: all focused Redshift tests pass.

- [ ] **Step 2: Run nearby SQL backend regression tests**

Run:

```powershell
node test\dorisRegistration.test.js
node test\dorisConnection.test.js
node test\dorisDialect.test.js
node test\dorisServiceIntegration.test.js
node test\dorisUiConfig.test.js
node test\kingbaseDialect.test.js
node test\kingbaseServiceIntegration.test.js
node test\kingbaseUiConfig.test.js
node test\multiBackendRegistration.test.js
node test\multiBackendUiConfig.test.js
```

Expected: all listed regression tests pass.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm run build
```

Expected: build completes. Existing webpack warnings are acceptable; new TypeScript errors are not acceptable.

- [ ] **Step 4: Inspect working tree for unrelated files**

Run:

```powershell
git status --short
```

Expected: Redshift files are either committed or the only unstaged files from this plan. Pre-existing unrelated dirty files remain unstaged.

- [ ] **Step 5: Commit verification fixes if any were needed**

If Steps 1-3 required fixes after Task 3, commit only Redshift implementation files:

```powershell
git add resources\icon\redshift.svg src\common\constants.ts src\service\connect\postgreSqlConnection.ts src\service\connect\redshiftConnection.ts src\service\connectionManager.ts src\service\dialect\redshiftDialect.ts src\service\serviceManager.ts src\model\database\connectionNode.ts src\model\database\schemaNode.ts src\model\main\tableGroup.ts src\vue\connect\index.vue test\redshiftRegistration.test.js test\redshiftConnection.test.js test\redshiftDialect.test.js test\redshiftServiceIntegration.test.js test\redshiftUiConfig.test.js
git commit -m "fix: stabilize redshift support"
```

Expected: commit is created only when fixes were needed. If no fixes were needed, no commit is created.

- [ ] **Step 6: Record live smoke-test gap**

If no Redshift cluster endpoint and credentials are available in the current environment, report this exact verification note in the handoff:

```text
Automated tests and build passed. Live Amazon Redshift smoke testing was not run because no cluster endpoint and credentials were provided.
```
