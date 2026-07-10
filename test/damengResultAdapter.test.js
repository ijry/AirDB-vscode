const assert = require("assert");
const { requireTs } = require("./testSetup");

const { adaptDamengResult } = requireTs("src/service/connect/damengResultAdapter.ts");

const selectResult = adaptDamengResult({
  rows: [{ ID: 1, NAME: "AirDB" }],
  metaData: [
    { name: "ID", precision: 10 },
    { name: "NAME", precision: 100 },
  ],
});

assert.deepStrictEqual(selectResult.results, [{ ID: 1, NAME: "AirDB" }]);
assert.deepStrictEqual(selectResult.fields.map((field) => field.name), ["ID", "NAME"]);
assert.deepStrictEqual(adaptDamengResult({ rowsAffected: 2 }).results, { affectedRows: 2 });

console.log("damengResultAdapter tests passed");
