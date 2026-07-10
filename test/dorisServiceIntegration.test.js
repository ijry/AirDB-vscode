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
