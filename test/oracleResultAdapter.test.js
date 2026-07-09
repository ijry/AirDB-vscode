const assert = require("assert");
const { requireTs } = require("./testSetup");

const { adaptOracleResult } = requireTs("src/service/connect/oracleResultAdapter.ts");

const selectResult = adaptOracleResult({
  rows: [{ ID: 1, NAME: "AirDB" }],
  metaData: [
    { name: "ID", dbTypeName: "NUMBER", byteSize: 22 },
    { name: "NAME", dbTypeName: "VARCHAR2", byteSize: 100 },
  ],
});

assert.deepStrictEqual(selectResult.results, [{ ID: 1, NAME: "AirDB" }]);
assert.deepStrictEqual(
  selectResult.fields.map((field) => ({ name: field.name, orgName: field.orgName, length: field.length })),
  [
    { name: "ID", orgName: "ID", length: 22 },
    { name: "NAME", orgName: "NAME", length: 100 },
  ]
);

const emptySelectResult = adaptOracleResult({
  rows: [],
  metaData: [{ name: "ID", dbTypeName: "NUMBER" }],
});
assert.deepStrictEqual(emptySelectResult.results, []);
assert.strictEqual(emptySelectResult.fields[0].name, "ID");

const dmlResult = adaptOracleResult({ rowsAffected: 3 });
assert.deepStrictEqual(dmlResult.results, { affectedRows: 3 });
assert.deepStrictEqual(dmlResult.fields, []);

const zeroDmlResult = adaptOracleResult({ rowsAffected: 0 });
assert.deepStrictEqual(zeroDmlResult.results, { affectedRows: 0 });

console.log("oracleResultAdapter tests passed");
