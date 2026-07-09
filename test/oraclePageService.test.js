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
