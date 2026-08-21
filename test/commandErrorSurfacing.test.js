// Regression tests for surfacing command failures.
//
// commandWrapper used a synchronous try/catch around handlers that are mostly
// async, so a rejected promise produced no notification and no output-channel
// line: the command simply looked like it did nothing. Util.process had the
// matching problem on the progress side -- its catch never resolved, so a failed
// backup/import left the notification spinning forever.
process.chdir(__dirname + "/..");

const assert = require("assert");
const setup = require("./testSetup.js");
const vscode = require("vscode");

const shown = [];
const logged = [];
vscode.window.showErrorMessage = (m) => { shown.push(m); return Promise.resolve(undefined); };
vscode.window.createOutputChannel = () => ({
  show() {}, appendLine: (l) => logged.push(l), dispose() {},
});
vscode.ProgressLocation = { Notification: 15 };

let progressSettled;
vscode.window.withProgress = (options, task) => {
  progressSettled = false;
  return Promise.resolve(task({ report() {} }, { onCancellationRequested() {} }))
    .then((v) => { progressSettled = true; return v; });
};

const { Console } = setup.requireTs("src/common/Console.ts");
const { Util } = setup.requireTs("src/common/util.ts");

function reset() { shown.length = 0; logged.length = 0; }

// Mirrors src/extension.ts commandWrapper. Kept in sync deliberately: the real
// one is not exported, and this pins the contract it must satisfy.
function commandWrapper(defs, command) {
  return (...args) => {
    try {
      const result = defs[command](...args);
      if (result && typeof result.then == "function") {
        return Promise.resolve(result).catch((err) => reportCommandError(err, command));
      }
      return result;
    } catch (err) {
      reportCommandError(err, command);
    }
  };
}
function reportCommandError(err, command) {
  if (Console.isReported(err)) {
    Console.log(`${command}: ${err?.message || err}`);
    return;
  }
  Console.reportError(err, command);
}

(async () => {

  // 1. An async handler's rejection must reach the user.
  reset();
  await commandWrapper({
    "airdb.redis.key.detail": async () => { throw new Error("connection lost"); },
  }, "airdb.redis.key.detail")();
  assert.strictEqual(shown.length, 1, "an async failure must show exactly one notification");
  assert.match(shown[0], /connection lost/);
  assert.match(shown[0], /airdb\.redis\.key\.detail/, "the message should name the command");

  // 2. A synchronous throw still reaches the user.
  reset();
  commandWrapper({ "airdb.sync.fail": () => { throw new Error("boom"); } }, "airdb.sync.fail")();
  assert.strictEqual(shown.length, 1, "a sync failure must still be reported");
  assert.match(shown[0], /boom/);

  // 3. A handler that already told the user must not double-notify.
  reset();
  await commandWrapper({
    "airdb.column.up": async () => {
      const err = new Error("Only mysql support change column position.");
      Console.reportError(err);          // handler surfaces it itself
      throw err;                         // ...and rethrows
    },
  }, "airdb.column.up")();
  assert.strictEqual(
    shown.length, 1,
    `one failure must yield one notification, got ${shown.length}: ${JSON.stringify(shown)}`
  );
  assert.ok(logged.some((l) => l.includes("airdb.column.up")), "the rethrow should still be logged");

  // 4. A successful handler must not report anything, and its value passes through.
  reset();
  const ok = await commandWrapper({ "airdb.ok": async () => "value" }, "airdb.ok")();
  assert.strictEqual(ok, "value", "the handler's resolved value should pass through");
  assert.strictEqual(shown.length, 0, "success must not notify");

  // 5. Util.process must settle its progress promise when the task rejects,
  //    instead of spinning forever.
  reset();
  Util.process("Doing backup ...", async () => { throw new Error("mysqldump missing"); });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(progressSettled, true, "a failed task must end the progress notification");
  assert.strictEqual(shown.length, 1, "the failure should be shown once");
  assert.match(shown[0], /mysqldump missing/);

  // 6. Util.process still resolves on the normal done() path.
  reset();
  Util.process("Working ...", (done) => { done(); });
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(progressSettled, true, "done() must end the progress notification");
  assert.strictEqual(shown.length, 0, "a successful task must not notify");

  console.log("commandErrorSurfacing: all assertions passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
