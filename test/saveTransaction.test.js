// Tests for the transactional edit-save path.
//
// save() used to concatenate every UPDATE into one string and hand it to execute():
// with MySQL's multipleStatements each statement committed separately, so a failure
// part way through left some edits applied and the rest silently dropped. updateFail
// was emitted with no listener anywhere, so nothing surfaced.
process.chdir(__dirname + "/..");

const assert = require("assert");
const fs = require("fs");
const path = require("path");

// queryUnit.ts pulls in the whole extension graph (nodes, providers, vscode), which
// other tests work around by stubbing it out entirely. Rather than fight that cycle,
// this mirrors runStatements/queryPromise and pins the source against the model.
function queryPromise(connection, sql, showError, values) {
  return new Promise((resolve, reject) => {
    const handler = (err, rows, fields, total) => {
      if (err) { reject(err); return; }
      resolve({ rows, fields, total });
    };
    if (values && values.length) {
      connection.query(sql, values, handler);
    } else {
      connection.query(sql, handler);
    }
  });
}

function runStatements(connection, statements) {
  return new Promise((resolve, reject) => {
    connection.beginTransaction(async (err) => {
      if (err) { reject(err); return; }
      try {
        for (const statement of statements) {
          const sql = statement && statement.sql && statement.sql.trim();
          if (!sql) { continue; }
          await queryPromise(connection, sql, true, statement.values);
        }
        connection.commit();
        resolve(true);
      } catch (e) {
        connection.rollback();
        reject(e);
      }
    });
  });
}

const QueryUnit = {
  runStatements,
  runBatch: (con, sqlList) => runStatements(con, sqlList.map((sql) => ({ sql }))),
};

/** Minimal IConnection double recording the transaction verbs it receives. */
function makeConnection({ failOn } = {}) {
  const calls = [];
  return {
    calls,
    query(sql, values, callback) {
      if (!callback && typeof values === "function") {
        callback = values;
        values = undefined;
      }
      calls.push({ sql, values });
      if (failOn && sql.includes(failOn)) {
        callback(new Error(`constraint violated on ${failOn}`));
        return;
      }
      callback(null, { affectedRows: 1 }, []);
    },
    beginTransaction(cb) { calls.push({ verb: "BEGIN" }); cb(null); },
    commit() { calls.push({ verb: "COMMIT" }); },
    rollback() { calls.push({ verb: "ROLLBACK" }); },
  };
}

const verbs = (c) => c.calls.filter((x) => x.verb).map((x) => x.verb);
const statements = (c) => c.calls.filter((x) => x.sql).map((x) => x.sql);

(async () => {

  // 1. A clean batch runs inside one transaction and commits.
  {
    const con = makeConnection();
    await QueryUnit.runStatements(con, [
      { sql: "UPDATE t SET a=? WHERE id=?;", values: ["x", 1] },
      { sql: "UPDATE t SET a=? WHERE id=?;", values: ["y", 2] },
    ]);
    assert.deepStrictEqual(verbs(con), ["BEGIN", "COMMIT"]);
    assert.strictEqual(statements(con).length, 2);
    assert.deepStrictEqual(con.calls.find((c) => c.sql).values, ["x", 1],
      "bind values must reach the driver");
  }

  // 2. A mid-batch failure rolls back and rejects; no partial commit.
  {
    const con = makeConnection({ failOn: "id=?2" });
    await assert.rejects(
      QueryUnit.runStatements(con, [
        { sql: "UPDATE t SET a=? WHERE id=?1;", values: ["x", 1] },
        { sql: "UPDATE t SET a=? WHERE id=?2;", values: ["y", 2] },
        { sql: "UPDATE t SET a=? WHERE id=?3;", values: ["z", 3] },
      ]),
      /constraint violated/
    );
    assert.deepStrictEqual(verbs(con), ["BEGIN", "ROLLBACK"], "a failed batch must roll back");
    assert.strictEqual(statements(con).length, 2, "statements after the failure must not run");
  }

  // 3. A failed BEGIN must abort rather than run the batch unwrapped.
  {
    const calls = [];
    const con = {
      query(sql, values, callback) {
        if (!callback && typeof values === "function") callback = values;
        calls.push(sql);
        callback(null, {}, []);
      },
      beginTransaction(cb) { cb(new Error("cannot start transaction")); },
      commit() { calls.push("COMMIT"); },
      rollback() { calls.push("ROLLBACK"); },
    };
    await assert.rejects(
      QueryUnit.runStatements(con, [{ sql: "UPDATE t SET a=1;" }]),
      /cannot start transaction/
    );
    assert.strictEqual(calls.length, 0, "nothing may run when BEGIN fails");
  }

  // 4. Statements without values use the 2-arg query form: passing an empty array
  //    would switch pg to the extended protocol and reject multi-statement text.
  {
    const con = makeConnection();
    await QueryUnit.runStatements(con, [{ sql: "UPDATE t SET a=1;", values: [] }]);
    assert.strictEqual(con.calls.find((c) => c.sql).values, undefined,
      "an empty values array must not be forwarded");
  }

  // 5. runBatch keeps its string-array contract.
  {
    const con = makeConnection();
    await QueryUnit.runBatch(con, ["UPDATE t SET a=1;", "  ", "UPDATE t SET a=2;"]);
    assert.deepStrictEqual(verbs(con), ["BEGIN", "COMMIT"]);
    assert.strictEqual(statements(con).length, 2, "blank entries are skipped");
  }

  // 6. The real implementation must keep the shape this test models.
  {
    const source = fs
      .readFileSync(path.resolve(__dirname, "..", "src/service/queryUnit.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    assert.match(source, /runStatements\s*\(/, "runStatements must exist");
    const body = source.slice(source.indexOf("runStatements"));
    const scoped = body.slice(0, body.indexOf("private static getSqlFromEditor"));
    assert.match(scoped, /beginTransaction\(async \(err\)/,
      "a failed BEGIN must be observable, or the batch runs unwrapped");
    assert.match(scoped, /rollback\(\)/, "a failed batch must roll back");
    assert.match(scoped, /statement\.values/, "per-statement bind values must be forwarded");

    // queryPromise must only take the bind path when there is something to bind.
    const qp = source.slice(source.indexOf("queryPromise"));
    const qpBody = qp.slice(0, qp.indexOf("runQuery"));
    assert.match(qpBody, /values\s*&&\s*values\.length/,
      "an empty values array must not be forwarded to the driver");

    // The save path must no longer execute a concatenated string.
    const query = fs
      .readFileSync(path.resolve(__dirname, "..", "src/service/result/query.ts"), "utf8");
    assert.match(query, /runStatements/, "saveModify must go through the transactional path");

    const app = fs
      .readFileSync(path.resolve(__dirname, "..", "src/vue/result/App.vue"), "utf8");
    assert.match(app, /on\("updateFail"/, "updateFail must have a listener");
    assert.ok(
      !/length\s*==\s*0\s*&&\s*this\.update\.lock/.test(app),
      "the save reentry guard must not require both conditions"
    );
  }

  console.log("saveTransaction: all assertions passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
