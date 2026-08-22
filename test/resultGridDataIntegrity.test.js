// Regression tests for the two data-corruption bugs in the result grid.
//
//  1. The grid renders filterData (search-filtered), so vxe reported a rowIndex
//     into that array while save() resolved the "old row" from the unfiltered
//     result.data. With a search active the arrays diverge, so the UPDATE targeted
//     an untouched row -- and since oldRow was a different record, nearly every
//     column read as changed and went into SET, primary key included.
//
//  2. result.primaryKey only retains the LAST column of a composite primary key
//     (query.ts overwrites it per column). The DELETE builder used that single
//     column, so removing one row of order_item(order_id, product_id) deleted that
//     product from every order.
//
// These model the real functions rather than mounting Vue; the shapes are taken
// from Row/index.vue, App.vue and EditDialog/index.vue.
process.chdir(__dirname + "/..");

const assert = require("assert");
const fs = require("fs");
const path = require("path");

function wrapByDb(name) { return `\`${name}\``; }

function wrapQuote(type, value) {
  if (value === "") return "''";
  if (value === null) return "null";
  if (typeof value == "string" && /\(.*?\)/.exec(value)) return value;
  if (typeof value == "string") value = value.replace(/'/g, "\\'");
  if (!type) return value;
  return ["varchar", "char", "text"].includes(type.toLowerCase()) ? `'${value}'` : value;
}

// --- Row/index.vue: resolveRowIndex + editListen ---------------------------
function resolveRowIndex(result, row) {
  const data = (result && result.data) || [];
  const direct = data.indexOf(row);
  if (direct >= 0) return direct;
  const pkList = (result && result.primaryKeyList) || [];
  const keys = pkList.length
    ? pkList.map((pk) => pk.name)
    : (result && result.primaryKey ? [result.primaryKey] : []);
  if (!keys.length) return -1;
  return data.findIndex((c) => keys.every((k) => c[k] === row[k]));
}

function editListen(result, editList, row, columnName, text) {
  const rowIndex = resolveRowIndex(result, row);
  if (rowIndex < 0) return editList;
  const next = editList.concat([]);
  if (!next[rowIndex]) next[rowIndex] = { ...row };
  next[rowIndex][columnName] = text;
  return next;
}

// --- EditDialog/index.vue: buildUpdateSql ---------------------------------
function buildUpdateSql(currentNew, oldRow, columns, primaryKeyList) {
  const typeOf = (k) => (columns[k] === undefined ? null : columns[k]);
  let change = "";
  for (const key in currentNew) {
    if (typeOf(key) == null) continue;
    if (oldRow[key] !== currentNew[key]) {
      change += `${wrapByDb(key)}=${wrapQuote(typeOf(key), currentNew[key])},`;
    }
  }
  if (!change) return "";
  let sql = `UPDATE \`t\` SET ${change.replace(/,$/, "")}`;
  primaryKeyList.forEach((pk, i) => {
    sql += ` ${i === 0 ? "WHERE" : "AND"} ${pk.name}=${wrapQuote(pk.type, oldRow[pk.name])}`;
  });
  return sql + ";";
}

// ---------------------------------------------------------------------------
// 1. Editing a row while a search filter is active must update THAT row.
// ---------------------------------------------------------------------------
{
  const columns = { id: "int", name: "varchar", note: "varchar" };
  const result = {
    primaryKey: "id",
    primaryKeyList: [{ name: "id", type: "int" }],
    data: [
      { id: 1, name: "alpha", note: "first" },
      { id: 2, name: "beta", note: "second" },
      { id: 3, name: "gamma", note: "third" },
      { id: 4, name: "target", note: "fourth" },
      { id: 5, name: "epsilon", note: "fifth" },
    ],
  };

  // The user searches "target": only id=4 stays visible, at rendered index 0.
  const search = "target";
  const filterData = result.data.filter((d) =>
    JSON.stringify(d).toLowerCase().includes(search.toLowerCase())
  );
  assert.strictEqual(filterData.length, 1);
  const rendered = filterData[0];

  const editList = editListen(result, [], rendered, "name", "renamed");

  // save(): pair each pending edit with its original row from result.data.
  let sql = "";
  for (const index in editList) {
    sql += buildUpdateSql(editList[index], result.data[index], columns, result.primaryKeyList);
  }

  assert.match(sql, /WHERE id=4/, `must target the edited row, got: ${sql}`);
  assert.ok(!/note=/.test(sql), `only the edited column belongs in SET, got: ${sql}`);
  assert.ok(!/`id`=/.test(sql), `the primary key must not be rewritten, got: ${sql}`);
  assert.match(sql, /`name`='renamed'/, `the edit itself must be applied, got: ${sql}`);
}

// ---------------------------------------------------------------------------
// 2. Unfiltered editing must keep working.
// ---------------------------------------------------------------------------
{
  const columns = { id: "int", name: "varchar" };
  const result = {
    primaryKey: "id",
    primaryKeyList: [{ name: "id", type: "int" }],
    data: [
      { id: 10, name: "a" },
      { id: 20, name: "b" },
    ],
  };
  const editList = editListen(result, [], result.data[1], "name", "b2");
  let sql = "";
  for (const index in editList) {
    sql += buildUpdateSql(editList[index], result.data[index], columns, result.primaryKeyList);
  }
  assert.match(sql, /WHERE id=20/, `unfiltered edit should still work, got: ${sql}`);
  assert.match(sql, /`name`='b2'/);
}

// ---------------------------------------------------------------------------
// 3. DELETE on a composite primary key must constrain every key column.
// ---------------------------------------------------------------------------
{
  // query.ts keeps only the last key column in primaryKey; the list is complete.
  const result = {
    dbType: "MySQL",
    table: "order_item",
    primaryKey: "product_id",
    primaryKeyList: [
      { name: "order_id", type: "int" },
      { name: "product_id", type: "int" },
    ],
  };
  const selected = [{ order_id: 7, product_id: 5, qty: 2 }];

  const pkList = result.primaryKeyList;
  const table = wrapByDb(result.table);
  let deleteSql;
  if (pkList.length > 1) {
    const addressable = selected.filter((r) => pkList.every((pk) => r[pk.name] != null));
    const clauses = addressable.map(
      (r) =>
        "(" +
        pkList.map((pk) => `${wrapByDb(pk.name)}=${wrapQuote(pk.type, r[pk.name])}`).join(" AND ") +
        ")"
    );
    deleteSql = `DELETE FROM ${table} WHERE ${clauses.join(" OR ")}`;
  }

  assert.match(deleteSql, /order_id`?=7/, `every key column must be constrained: ${deleteSql}`);
  assert.match(deleteSql, /product_id`?=5/, `every key column must be constrained: ${deleteSql}`);
  assert.ok(
    / AND /.test(deleteSql),
    `composite keys must be ANDed, or the DELETE hits unrelated rows: ${deleteSql}`
  );
}

// ---------------------------------------------------------------------------
// 4. The shipped source must not reintroduce either shape.
// ---------------------------------------------------------------------------
{
  const row = fs.readFileSync(
    path.resolve(__dirname, "..", "src/vue/result/component/Row/index.vue"), "utf8"
  );
  assert.ok(
    !/rowIndex\s*=\s*scope\.rowIndex/.test(row),
    "editListen must not key edits by the rendered row index"
  );
  const app = fs.readFileSync(
    path.resolve(__dirname, "..", "src/vue/result/App.vue"), "utf8"
  );
  assert.match(
    app, /primaryKeyList/,
    "the DELETE builder must consult primaryKeyList, not just primaryKey"
  );
}

console.log("resultGridDataIntegrity: all assertions passed");
