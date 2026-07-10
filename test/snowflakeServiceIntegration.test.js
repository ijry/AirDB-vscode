const assert = require("assert");
const path = require("path");
const { requireTs, root } = require("./testSetup");

function mockModule(relativePath, exports) {
  const filename = path.resolve(root, relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

class EmptyDisposableProvider {}
class MockSnowflakeDialect {}
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
mockModule("src/service/dialect/snowflakeDialect.ts", { SnowflakeDialect: MockSnowflakeDialect });
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
const { SnowflakeDialect } = requireTs("src/service/dialect/snowflakeDialect.ts");
const { PostgreSqlPageService } = requireTs("src/service/page/postgreSqlPageService.ts");
const { PostgresqlImortService } = requireTs("src/service/import/postgresqlImortService.ts");
const { DumpService } = requireTs("src/service/dump/dumpService.ts");

assert.strictEqual(DatabaseType.SNOWFLAKE, "Snowflake");
assert(ServiceManager.getDialect(DatabaseType.SNOWFLAKE) instanceof SnowflakeDialect);
assert(ServiceManager.getPageService(DatabaseType.SNOWFLAKE) instanceof PostgreSqlPageService);
assert(ServiceManager.getImportService(DatabaseType.SNOWFLAKE) instanceof PostgresqlImortService);
assert(ServiceManager.getDumpService(DatabaseType.SNOWFLAKE) instanceof DumpService);

console.log("snowflakeServiceIntegration tests passed");
