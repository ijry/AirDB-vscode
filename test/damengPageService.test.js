const assert = require("assert");
const { requireTs } = require("./testSetup");

const { DamengPageService } = requireTs("src/service/page/damengPageService.ts");

class TestDamengPageService extends DamengPageService {
  exposeBuildPageSql(sql, start, limit) {
    return this.buildPageSql(sql, start, limit);
  }
}

const service = new TestDamengPageService();

assert.strictEqual(
  service.exposeBuildPageSql("SELECT * FROM DEMO", 20, 10),
  "SELECT * FROM DEMO OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY"
);
assert.strictEqual(
  service.exposeBuildPageSql("SELECT * FROM DEMO OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY", 10, 10),
  "SELECT * FROM DEMO OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY"
);

console.log("damengPageService tests passed");
