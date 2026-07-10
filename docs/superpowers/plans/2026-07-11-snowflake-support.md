# Snowflake Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Snowflake as a SQL backend with connection UI, metadata browsing, query execution, pagination, tests, and build verification.

**Architecture:** Snowflake uses a dedicated `SnowflakeConnection` over the official `snowflake-sdk` and a dedicated `SnowflakeDialect` for Snowflake metadata and DDL templates. Existing AirDB SQL routing, tree nodes, query workspace, import fallback, dump fallback, and PostgreSQL-style pagination are reused where compatible.

**Tech Stack:** TypeScript, Vue 2, `snowflake-sdk@^1.15.0`, existing Node test harness, existing webpack build.

## Global Constraints

- Keep the current VS Code engine `^1.73.0`; do not add a driver version that requires Node.js 20.
- Use `snowflake-sdk@^1.15.0` instead of `snowflake-sdk@latest`.
- Do not implement SSO, OAuth, MFA, key-pair authentication, Snowflake stage file operations, or warehouse administration in this pass.
- Do not stage or revert unrelated dirty files already present in the workspace.
- Use `apply_patch` for manual edits.

---

## File Structure

- `package.json` and `package-lock.json`: add the Snowflake SDK runtime dependency.
- `src/common/constants.ts`: add `DatabaseType.SNOWFLAKE = "Snowflake"`.
- `src/model/interface/node.ts`: add Snowflake-specific fields and copy them in `init`.
- `src/service/connect/snowflakeConnection.ts`: new `IConnection` implementation wrapping `snowflake-sdk`.
- `src/service/connectionManager.ts`: import and instantiate `SnowflakeConnection`.
- `src/service/dialect/snowflakeDialect.ts`: new metadata, source, template, and schema switching SQL.
- `src/service/serviceManager.ts`: route Snowflake dialect, page service, import service, and dump fallback.
- `src/model/database/connectionNode.ts`: show Snowflake icon and treat Snowflake as catalog-backed.
- `src/model/database/schemaNode.ts`: drop schema behavior treats Snowflake like PostgreSQL/Redshift.
- `src/model/main/tableGroup.ts`: pin/filter state treats Snowflake like PostgreSQL/Redshift.
- `src/vue/connect/component/Snowflake.vue`: new Snowflake-specific connection fields.
- `src/vue/connect/index.vue`: register component, tab, logo, defaults, SSL visibility, and custom form routing.
- `resources/icon/snowflake.svg`: Snowflake logo.
- `test/snowflakeRegistration.test.js`: static registration and tree behavior checks.
- `test/snowflakeConnection.test.js`: mocked SDK connection adapter checks.
- `test/snowflakeDialect.test.js`: SQL generation checks.
- `test/snowflakeServiceIntegration.test.js`: service routing checks.
- `test/snowflakeUiConfig.test.js`: connection UI and logo checks.

---

### Task 1: Dependency And Registration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/common/constants.ts`
- Modify: `src/model/interface/node.ts`
- Modify: `src/service/connectionManager.ts`
- Test: `test/snowflakeRegistration.test.js`

**Interfaces:**
- Produces: `DatabaseType.SNOWFLAKE` with value `"Snowflake"`.
- Produces: `Node.account?: string`, `Node.warehouse?: string`, `Node.role?: string`, `Node.authenticator?: string`.
- Produces: `ConnectionManager.create(opt)` routing `DatabaseType.SNOWFLAKE` to `new SnowflakeConnection(opt)`.

- [ ] **Step 1: Add dependency**

Run: `npm install snowflake-sdk@^1.15.0 --save`

Expected: `package.json` contains `"snowflake-sdk": "^1.15.0"` and `package-lock.json` resolves a 1.x package.

- [ ] **Step 2: Write registration test**

Create `test/snowflakeRegistration.test.js` that reads source files and asserts:

```js
assert.match(constants, /SNOWFLAKE\s*=\s*"Snowflake"/);
assert.match(connectionManager, /SnowflakeConnection/);
assert.match(connectionManager, /case DatabaseType\.SNOWFLAKE:[\s\S]*new SnowflakeConnection/);
assert.match(node, /public account\?: string/);
assert.match(node, /this\.account = source\.account/);
```

Run: `node test\snowflakeRegistration.test.js`

Expected before implementation: FAIL on missing enum or connection.

- [ ] **Step 3: Implement registration fields and connection manager route**

Add `SNOWFLAKE = "Snowflake"` after `REDSHIFT` in `DatabaseType`, add Snowflake fields to `Node`, copy them in `Node.init`, import `SnowflakeConnection`, and add the switch case.

- [ ] **Step 4: Run registration test**

Run: `node test\snowflakeRegistration.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json src/common/constants.ts src/model/interface/node.ts src/service/connectionManager.ts test/snowflakeRegistration.test.js
git commit -m "feat: register snowflake connection type"
```

---

### Task 2: Snowflake Connection Adapter

**Files:**
- Create: `src/service/connect/snowflakeConnection.ts`
- Test: `test/snowflakeConnection.test.js`

**Interfaces:**
- Consumes: `Node.account`, `Node.host`, `Node.port`, `Node.user`, `Node.password`, `Node.database`, `Node.schema`, `Node.warehouse`, `Node.role`, `Node.authenticator`, `Node.useSSL`, `Node.connectTimeout`, `Node.requestTimeout`.
- Produces: `class SnowflakeConnection extends IConnection`.
- Produces: `static normalizeNode(node: Node): Node`.

- [ ] **Step 1: Write connection test with mocked SDK**

Create `test/snowflakeConnection.test.js` that injects a fake `snowflake-sdk` module, imports `SnowflakeConnection`, and verifies:

```js
assert.strictEqual(createdConfigs[0].account, "xy12345.ap-southeast-1.aws");
assert.strictEqual(createdConfigs[0].username, "AIRDB_USER");
assert.strictEqual(createdConfigs[0].warehouse, "COMPUTE_WH");
assert.strictEqual(createdConfigs[0].schema, "PUBLIC");
assert.strictEqual(createdConfigs[0].authenticator, "SNOWFLAKE");
assert.strictEqual(createdConfigs[0].clientSessionKeepAlive, true);
```

Also verify `connect`, `isAlive`, callback query result rows, DML affected rows, EventEmitter dump path, and `end`.

Run: `node test\snowflakeConnection.test.js`

Expected before implementation: FAIL because the connection file does not exist.

- [ ] **Step 2: Implement adapter**

Implement `SnowflakeConnection`:

```ts
const options = {
  account: node.account || node.host,
  host: node.host && node.account ? node.host : undefined,
  username: node.user,
  password: node.password,
  database: node.database || undefined,
  schema: node.schema || "PUBLIC",
  warehouse: node.warehouse || undefined,
  role: node.role || undefined,
  authenticator: node.authenticator || "SNOWFLAKE",
  clientSessionKeepAlive: true,
  loginTimeout: Math.ceil((node.connectTimeout || 5000) / 1000),
  requestTimeout: node.requestTimeout || 10000,
};
```

Use `snowflake.createConnection(options)`, `connect(callback)`, `execute({ sqlText, complete })`, and `destroy(callback?)`.

- [ ] **Step 3: Run connection test**

Run: `node test\snowflakeConnection.test.js`

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/service/connect/snowflakeConnection.ts test/snowflakeConnection.test.js
git commit -m "feat: add snowflake connection adapter"
```

---

### Task 3: Dialect, Services, And Tree Behavior

**Files:**
- Create: `src/service/dialect/snowflakeDialect.ts`
- Modify: `src/service/serviceManager.ts`
- Modify: `src/model/database/connectionNode.ts`
- Modify: `src/model/database/schemaNode.ts`
- Modify: `src/model/main/tableGroup.ts`
- Test: `test/snowflakeDialect.test.js`
- Test: `test/snowflakeServiceIntegration.test.js`
- Test: `test/snowflakeRegistration.test.js`

**Interfaces:**
- Produces: `class SnowflakeDialect extends SqlDialect`.
- Produces: `ServiceManager.getDialect(DatabaseType.SNOWFLAKE) instanceof SnowflakeDialect`.
- Produces: `ServiceManager.getPageService(DatabaseType.SNOWFLAKE) instanceof PostgreSqlPageService`.
- Produces: `ServiceManager.getImportService(DatabaseType.SNOWFLAKE) instanceof PostgresqlImortService`.

- [ ] **Step 1: Write dialect and service tests**

Create `test/snowflakeDialect.test.js` asserting SQL contains:

```js
assert.match(dialect.showDatabases(), /SHOW DATABASES/i);
assert.match(dialect.showSchemas(), /INFORMATION_SCHEMA\.SCHEMATA/i);
assert.match(dialect.showTables("PUBLIC"), /TABLE_SCHEMA = 'PUBLIC'/);
assert.match(dialect.showColumns("PUBLIC", "ORDERS"), /ORDER BY ORDINAL_POSITION/i);
assert.match(dialect.showTableSource("PUBLIC", "ORDERS"), /GET_DDL\('TABLE'/);
assert.match(dialect.tableTemplate(), /AUTOINCREMENT/i);
assert.match(dialect.procedureTemplate(), /LANGUAGE SQL/i);
```

Create `test/snowflakeServiceIntegration.test.js` mirroring Redshift service routing with mocked imports.

Run:

```bash
node test\snowflakeDialect.test.js
node test\snowflakeServiceIntegration.test.js
```

Expected before implementation: FAIL.

- [ ] **Step 2: Implement dialect**

Implement metadata methods with aliases consumed by AirDB:

```sql
SELECT DATABASE_NAME "Database" FROM INFORMATION_SCHEMA.DATABASES ORDER BY DATABASE_NAME
SELECT CATALOG_NAME "Database", SCHEMA_NAME "schema" FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME <> 'INFORMATION_SCHEMA'
SELECT TABLE_NAME "name", COMMENT "comment" FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '<schema>' AND TABLE_TYPE = 'BASE TABLE'
SELECT TABLE_NAME "name" FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = '<schema>'
SELECT COLUMN_NAME "name", DATA_TYPE "simpleType", DATA_TYPE "type", IS_NULLABLE nullable, CHARACTER_MAXIMUM_LENGTH "maxLength", COLUMN_DEFAULT "defaultValue", COMMENT "comment", '' "key" FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '<schema>' AND TABLE_NAME = '<table>' ORDER BY ORDINAL_POSITION
```

Use local literal escaping for single quotes.

- [ ] **Step 3: Route services and tree behavior**

Import `SnowflakeDialect`; route dialect, page service, and import service. Treat Snowflake as catalog-backed in `connectionNode.ts`, `schemaNode.ts`, and `tableGroup.ts` wherever Redshift/PostgreSQL are handled.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node test\snowflakeDialect.test.js
node test\snowflakeServiceIntegration.test.js
node test\snowflakeRegistration.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/service/dialect/snowflakeDialect.ts src/service/serviceManager.ts src/model/database/connectionNode.ts src/model/database/schemaNode.ts src/model/main/tableGroup.ts test/snowflakeDialect.test.js test/snowflakeServiceIntegration.test.js test/snowflakeRegistration.test.js
git commit -m "feat: add snowflake dialect and services"
```

---

### Task 4: Connection UI And Logo

**Files:**
- Create: `src/vue/connect/component/Snowflake.vue`
- Create: `resources/icon/snowflake.svg`
- Modify: `src/vue/connect/index.vue`
- Test: `test/snowflakeUiConfig.test.js`

**Interfaces:**
- Produces: `Snowflake` tab in `supportDatabases`.
- Produces: `dbLogoMap.Snowflake.icon = require("@/../resources/icon/snowflake.svg")`.
- Produces: Snowflake defaults for account, host, port, user, password, database, schema, warehouse, role, authenticator, useSSL, connectTimeout, and requestTimeout.

- [ ] **Step 1: Write UI config test**

Create `test/snowflakeUiConfig.test.js` asserting:

```js
assert.match(connect, /import Snowflake from "\.\/component\/Snowflake\.vue"/);
assert.match(connect, /<Snowflake\s+v-else-if="connectionOption\.dbType == 'Snowflake'"/);
assert.match(connect, /Snowflake:\s*\{[\s\S]*snowflake\.svg/);
assert.match(connect, /"Redshift",\s*"Snowflake",\s*"ClickHouse"/);
assert.match(connect, /case "Snowflake":[\s\S]*this\.connectionOption\.port = 443/);
assert.match(component, /Account/);
assert.match(component, /Warehouse/);
assert.match(component, /Authenticator/);
```

Run: `node test\snowflakeUiConfig.test.js`

Expected before implementation: FAIL.

- [ ] **Step 2: Add UI component**

Create a compact `Snowflake.vue` component with fields for `Account`, optional `Host`, `Port`, `Username`, `Password`, `Database`, `Schema`, `Warehouse`, `Role`, `Authenticator`, `Connection Timeout`, and `Request Timeout`.

- [ ] **Step 3: Register tab, logo, defaults, SSL**

Modify `index.vue` to import/register `Snowflake`, include the tab after Redshift, show `Use SSL` for Snowflake, hide the generic form for Snowflake, and set defaults:

```js
account = "";
host = "";
port = 443;
user = "";
password = "";
database = "";
schema = "PUBLIC";
warehouse = "";
role = "";
authenticator = "SNOWFLAKE";
useSSL = true;
connectTimeout = 5000;
requestTimeout = 10000;
```

- [ ] **Step 4: Add logo**

Create a simple SVG logo that uses Snowflake's recognizable snowflake geometry and includes the string `Snowflake` for static tests.

- [ ] **Step 5: Run UI test**

Run: `node test\snowflakeUiConfig.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/vue/connect/component/Snowflake.vue src/vue/connect/index.vue resources/icon/snowflake.svg test/snowflakeUiConfig.test.js
git commit -m "feat: add snowflake connection ui"
```

---

### Task 5: Regression And Build Verification

**Files:**
- Modify only files needed to fix failures found by tests.

**Interfaces:**
- Produces: passing focused Snowflake tests.
- Produces: passing nearby backend regression tests.
- Produces: successful production build.

- [ ] **Step 1: Run focused Snowflake tests**

Run:

```bash
node test\snowflakeRegistration.test.js
node test\snowflakeConnection.test.js
node test\snowflakeDialect.test.js
node test\snowflakeServiceIntegration.test.js
node test\snowflakeUiConfig.test.js
```

Expected: all PASS.

- [ ] **Step 2: Run nearby regressions**

Run:

```bash
node test\redshiftRegistration.test.js
node test\redshiftConnection.test.js
node test\redshiftDialect.test.js
node test\redshiftServiceIntegration.test.js
node test\redshiftUiConfig.test.js
node test\dorisRegistration.test.js
node test\dorisConnection.test.js
node test\dorisDialect.test.js
node test\dorisServiceIntegration.test.js
node test\dorisUiConfig.test.js
node test\s3TreeRegistration.test.js
node test\s3ConnectionConfig.test.js
node test\s3Connection.test.js
node test\s3UiConfig.test.js
```

Expected: all PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: exit code 0. Existing webpack warnings about dynamic requires, optional dependencies, and bundle size are acceptable if unchanged.

- [ ] **Step 4: Commit fixes if needed**

If verification required code changes, commit only Snowflake-related changes:

```bash
git add <snowflake-related-files>
git commit -m "fix: stabilize snowflake support"
```

- [ ] **Step 5: Final status**

Report committed changes, test results, and note that live Snowflake smoke testing was not run without account credentials.
