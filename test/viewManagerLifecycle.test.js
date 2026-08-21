// Regression tests for ViewManager panel lifecycle.
//
// The panel is registered into viewStatu synchronously, but every lifecycle
// binding (onDidDispose, eventHandler, message plumbing) used to be deferred to
// the fs.readFile callback. That gap produced two user-visible failures:
//
//   1. a tab closed inside the gap never cleared the cache entry, so every later
//      open revealed a disposed panel and silently did nothing until reload
//   2. a second call inside the gap installed listeners via the reuse branch and
//      the readFile callback then added a second copy, so one click ran every
//      handler twice -- a duplicated UPDATE, for instance
//
// Run directly (NOT with -r ./test/testSetup.js, which would load a second copy
// of viewManager and defeat the fs.readFile stub).
process.chdir(__dirname + "/..");

const assert = require("assert");
const setup = require("./testSetup.js");
const vscode = require("vscode");

vscode.ViewColumn = { One: 1, Two: 2 };
vscode.Uri = { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) };
vscode.commands = vscode.commands || { executeCommand() {} };
vscode.env = vscode.env || { language: "en" };

// Gate the html read so a test can control when a panel finishes booting.
const fs = require("fs");
let pendingRead = null;
fs.readFile = (p, enc, cb) => { pendingRead = () => cb(null, "<html></html>"); };

const { ViewManager } = setup.requireTs("src/common/viewManager.ts");

// ViewManager reads the stored login state while wiring a panel up. In the real
// extension Global.context is assigned before initExtesnsionPath
// (serviceManager.ts:77 vs :80), so this is always available there.
const { Global } = setup.requireTs("src/common/global.ts");
const memento = new Map();
Global.context = {
  globalState: {
    get: (k, d) => (memento.has(k) ? memento.get(k) : d),
    update: (k, v) => { memento.set(k, v); return Promise.resolve(); },
  },
};

const panels = [];
function makePanel() {
  const panel = {
    visible: true, disposed: false, title: "", iconPath: null,
    revealCount: 0,
    _disposeListeners: [],
    webview: {
      html: "",
      onDidReceiveMessage() {},
      postMessage() {},
      asWebviewUri: (u) => ({ toString: () => `vscode-webview://${u.fsPath}` }),
    },
    onDidDispose(listener) { this._disposeListeners.push(listener); return { dispose() {} }; },
    reveal() {
      if (this.disposed) { throw new Error("Webview is disposed"); }
      this.revealCount++;
    },
    dispose() {
      this.disposed = true;
      this._disposeListeners.forEach((l) => l());
    },
  };
  panels.push(panel);
  return panel;
}
vscode.window.createWebviewPanel = makePanel;

ViewManager.initExtesnsionPath("X:/fake");

function reset() {
  panels.length = 0;
  pendingRead = null;
  ViewManager.viewStatu = {};
}

const opt = (type, tag, sink) => ({
  path: "result", title: "Query", type, singlePage: true,
  eventHandler: (h) => { h.on("execute", (sql) => sink.push(`${tag}:${sql}`)); },
});

(async () => {

// ---------------------------------------------------------------------------
// 1. One click must run one handler, even when a second open lands while the
//    first is still reading its html.
// ---------------------------------------------------------------------------
reset();
{
  const ran = [];
  ViewManager.createWebviewPanel(opt("Query", "RUN", ran)).catch(() => {});
  ViewManager.createWebviewPanel(opt("Query", "DATA", ran)).catch(() => {});
  pendingRead();

  assert.strictEqual(panels.length, 1, "the second call should reuse the first panel");

  const emitter = ViewManager.viewStatu["Query"].eventEmitter;
  assert.strictEqual(
    emitter.listenerCount("execute"), 1,
    `expected a single 'execute' listener, found ${emitter.listenerCount("execute")}`
  );

  emitter.emit("execute", "UPDATE t SET n = n + 1");
  assert.deepStrictEqual(
    ran, ["DATA:UPDATE t SET n = n + 1"],
    `one click must run one handler, but got ${JSON.stringify(ran)}`
  );
}

// ---------------------------------------------------------------------------
// 2. Closing the tab while the html is still loading must clear the cache, so
//    the next open builds a fresh panel instead of reviving a dead one.
// ---------------------------------------------------------------------------
reset();
{
  const ran = [];
  const opening = ViewManager.createWebviewPanel(opt("Design", "FIRST", ran));
  const first = panels[0];

  first.dispose();                       // user closes the tab mid-load
  pendingRead();                         // html read completes afterwards
  await opening;

  assert.strictEqual(
    ViewManager.viewStatu["Design"], null,
    "a panel disposed during load must not stay cached"
  );

  const reopened = ViewManager.createWebviewPanel(opt("Design", "SECOND", ran));
  assert.strictEqual(panels.length, 2, "reopening must create a new panel");
  pendingRead();
  await reopened;
}

// ---------------------------------------------------------------------------
// 3. A cached panel that was disposed after loading must not be revealed: the
//    reveal() throw used to escape into the caller and abort the open.
// ---------------------------------------------------------------------------
reset();
{
  const ran = [];
  const opening = ViewManager.createWebviewPanel(opt("Status", "FIRST", ran));
  pendingRead();
  await opening;

  const live = panels[0];
  live.visible = false;                  // force the reveal() path
  live.disposed = true;                  // ...on a panel vscode already tore down

  const reopened = ViewManager.createWebviewPanel(opt("Status", "SECOND", ran));
  assert.strictEqual(panels.length, 2, "a dead cached panel must be replaced, not revealed");
  pendingRead();
  await reopened;
}

// ---------------------------------------------------------------------------
// 4. Normal reuse still works: a live panel is revealed and not duplicated.
// ---------------------------------------------------------------------------
reset();
{
  const ran = [];
  const opening = ViewManager.createWebviewPanel(opt("Reuse", "FIRST", ran));
  pendingRead();
  await opening;

  const live = panels[0];
  live.visible = false;
  await ViewManager.createWebviewPanel(opt("Reuse", "SECOND", ran));

  assert.strictEqual(panels.length, 1, "a live panel should be reused");
  assert.strictEqual(live.revealCount, 1, "a hidden live panel should be revealed");

  const emitter = ViewManager.viewStatu["Reuse"].eventEmitter;
  emitter.emit("execute", "SELECT 1");
  assert.deepStrictEqual(ran, ["SECOND:SELECT 1"], "only the newest handler should run");
}

// ---------------------------------------------------------------------------
// 5. Disposing a panel must not leave its listeners behind.
// ---------------------------------------------------------------------------
reset();
{
  const ran = [];
  const opening = ViewManager.createWebviewPanel(opt("Leak", "FIRST", ran));
  pendingRead();
  await opening;

  const emitter = ViewManager.viewStatu["Leak"].eventEmitter;
  assert.ok(emitter.listenerCount("execute") > 0, "listener should be installed while live");
  panels[0].dispose();
  assert.strictEqual(
    emitter.listenerCount("execute"), 0,
    "disposing the panel should drop its listeners"
  );
}

console.log("viewManagerLifecycle: all assertions passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

