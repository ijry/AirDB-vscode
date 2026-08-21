const assert = require("assert");
const path = require("path");
const { requireTs, vscodeStub, root } = require("./testSetup");

// ---------------------------------------------------------------------------
// Stub out the pieces XtermTerminal depends on so the session bookkeeping can be
// driven directly: a fake panel whose dispose() fires onDidDispose (the signal the
// real "open in terminal" regression hinged on), and a fake ssh2 Client.
// ---------------------------------------------------------------------------

vscodeStub.ThemeIcon = class ThemeIcon {
  constructor(id) { this.id = id; }
};
vscodeStub.Uri = { file: (p) => ({ fsPath: p, scheme: "file" }), parse: (s) => ({ toString: () => s }) };
vscodeStub.Selection = class Selection {};
vscodeStub.env = { openExternal() {} };

const errorMessages = [];
vscodeStub.window.showErrorMessage = (message) => { errorMessages.push(message); };

class FakePanel {
  constructor(type) {
    this.viewType = type;
    this.visible = true;
    this.disposed = false;
    this.revealCount = 0;
    this.posted = [];
    this._disposeListeners = [];
  }
  onDidDispose(listener) {
    this._disposeListeners.push(listener);
    return { dispose() {} };
  }
  reveal() {
    // Mirror vscode: revealing a disposed panel throws.
    if (this.disposed) { throw new Error("Webview is disposed"); }
    this.revealCount++;
  }
  dispose() {
    this.disposed = true;
    this._disposeListeners.forEach((listener) => listener());
  }
  get webview() {
    const posted = this.posted;
    return { postMessage(message) { posted.push(message); return Promise.resolve(true); } };
  }
}

// A stand-in for the ssh2 Client that lets the test decide when 'ready' fires.
const clients = [];
class FakeClient {
  constructor() {
    this.handlers = {};
    this.ended = false;
    clients.push(this);
  }
  on(event, handler) { (this.handlers[event] ||= []).push(handler); return this; }
  connect(config) { this.connected = true; this.connectConfig = config; return this; }
  end() { this.ended = true; }
  fire(event, ...args) { (this.handlers[event] || []).forEach((handler) => handler(...args)); }
  shell(_options, callback) {
    const stream = {
      write() {}, setWindow() {},
      on(event, handler) { (this._h ||= {})[event] = handler; return this; },
    };
    callback(null, stream);
  }
}
require.cache[require.resolve("ssh2")] = {
  id: require.resolve("ssh2"),
  filename: require.resolve("ssh2"),
  loaded: true,
  exports: { Client: FakeClient },
};

// Capture the ViewManager panels the terminal service creates.
const { ViewManager, Hanlder } = requireTs("src/common/viewManager.ts");
const EventEmitter = require("events");

const created = [];
ViewManager.createWebviewPanel = (viewOption) => {
  const panel = new FakePanel(viewOption.type);
  const emitter = new EventEmitter();
  const handler = new Hanlder(panel, emitter);
  created.push({ viewOption, panel, emitter, handler });
  if (viewOption.eventHandler) { viewOption.eventHandler(handler); }
  return Promise.resolve(panel);
};

const { XtermTerminal } = requireTs("src/service/ssh/terminal/xtermTerminalService.ts");

const sshConfig = { username: "root", host: "10.0.0.1", port: 22 };

/** Drive a freshly created entry through the webview handshake up to a live shell. */
function bringUp(entry) {
  entry.emitter.emit("initTerminal", { cols: 80, rows: 24 });
  const client = clients[clients.length - 1];
  client.fire("ready");
  return client;
}

function pathEmits(entry) {
  return entry.panel.posted.filter((message) => message.type === "path");
}

// ---------------------------------------------------------------------------
// 1. Closing the terminal tab must unregister the session, so the next
//    "open in terminal" opens a fresh panel instead of silently failing on a
//    reveal() of the disposed webview.
// ---------------------------------------------------------------------------
(async () => {
  created.length = 0;
  clients.length = 0;
  const terminal = new XtermTerminal();

  const first = terminal.openPath(sshConfig, "/var/log");
  const firstEntry = created[0];
  assert.ok(firstEntry, "a panel should be created on first open");
  bringUp(firstEntry);
  await first;
  assert.strictEqual(pathEmits(firstEntry).length, 1, "cd should be sent to the new terminal");

  // User closes the tab.
  firstEntry.panel.dispose();

  const second = terminal.openPath(sshConfig, "/etc");
  const secondEntry = created[1];
  assert.ok(secondEntry, "closing the tab must not leave a stale session behind");
  assert.notStrictEqual(
    secondEntry.viewOption.type,
    firstEntry.viewOption.type,
    "the replacement panel needs its own type so ViewManager does not reuse the dead one"
  );
  bringUp(secondEntry);
  await second;
  assert.strictEqual(pathEmits(secondEntry).length, 1, "cd should reach the replacement terminal");

  // ---------------------------------------------------------------------------
  // 2. A live terminal is reused rather than duplicated.
  // ---------------------------------------------------------------------------
  const before = created.length;
  await terminal.openPath(sshConfig, "/opt");
  assert.strictEqual(created.length, before, "an existing terminal should be reused");
  assert.ok(secondEntry.panel.revealCount > 0, "the reused terminal should be revealed");
  assert.strictEqual(pathEmits(secondEntry).length, 2, "the second cd should reuse the live terminal");

  // ---------------------------------------------------------------------------
  // 3. Two rapid clicks during the SSH handshake must not race into two panels
  //    (the old code derived the panel type from a map written only on 'ready').
  // ---------------------------------------------------------------------------
  created.length = 0;
  clients.length = 0;
  const fresh = new XtermTerminal();
  const other = { username: "root", host: "10.0.0.2", port: 22 };

  const clickA = fresh.openPath(other, "/srv");
  const clickB = fresh.openPath(other, "/srv2");
  assert.strictEqual(created.length, 1, "a double click must share one terminal, not open two");

  bringUp(created[0]);
  await Promise.all([clickA, clickB]);
  assert.strictEqual(pathEmits(created[0]).length, 2, "both clicks should cd in the shared terminal");

  // ---------------------------------------------------------------------------
  // 4. Closing one of two terminals on the same host must not unregister the
  //    other (the old code cleared the shared sshUrl key unconditionally).
  // ---------------------------------------------------------------------------
  created.length = 0;
  clients.length = 0;
  const multi = new XtermTerminal();
  const host = { username: "root", host: "10.0.0.3", port: 22 };

  const openA = multi.openMethod(host);
  bringUp(created[0]);
  await openA;
  const openB = multi.openMethod(host);
  bringUp(created[1]);
  await openB;
  assert.strictEqual(created.length, 2, "openMethod should always create a new terminal");

  // Close the most recently opened one; the first must still be usable.
  created[1].panel.dispose();
  await multi.openPath(host, "/data");
  assert.strictEqual(
    created.length, 2,
    "the surviving terminal on the same host should be reused, not replaced"
  );
  assert.strictEqual(
    pathEmits(created[0]).length, 1,
    "cd should fall back to the surviving terminal"
  );

  // ---------------------------------------------------------------------------
  // 5. A failed connection must not leave a session that swallows later clicks.
  // ---------------------------------------------------------------------------
  created.length = 0;
  clients.length = 0;
  const failing = new XtermTerminal();
  const dead = { username: "root", host: "10.0.0.4", port: 22 };

  const attempt = failing.openPath(dead, "/x");
  created[0].emitter.emit("initTerminal", { cols: 80, rows: 24 });
  clients[clients.length - 1].fire("error", new Error("connect ETIMEDOUT"));
  await attempt;

  const retry = failing.openPath(dead, "/y");
  assert.strictEqual(created.length, 2, "a failed connection must not block a retry");
  bringUp(created[1]);
  await retry;
  assert.strictEqual(pathEmits(created[1]).length, 1, "the retry should reach a working terminal");

  // ---------------------------------------------------------------------------
  // 6. The terminal must resolve privateKeyPath itself and bound the handshake.
  //    It used to pass sshConfig through untouched, relying on ClientManager having
  //    already cached sshConfig.privateKey as a side effect -- so opening a terminal
  //    from a collapsed connection node skipped key auth entirely.
  // ---------------------------------------------------------------------------
  const fsMod = require("fs");
  const osMod = require("os");
  const tmpDir = fsMod.mkdtempSync(path.join(osMod.tmpdir(), "airdb-term-key-"));
  const keyPath = path.join(tmpDir, "id_rsa");
  fsMod.writeFileSync(keyPath, "TERMINAL-KEY");
  try {
    created.length = 0;
    clients.length = 0;
    const keyed = new XtermTerminal();
    const keyHost = { username: "root", host: "10.0.0.5", port: 22, privateKeyPath: keyPath };

    const open = keyed.openMethod(keyHost);
    created[0].emitter.emit("initTerminal", { cols: 80, rows: 24 });
    const client = clients[clients.length - 1];
    client.fire("ready");
    await open;

    assert.ok(client.connectConfig, "connect() should receive an explicit config");
    assert.strictEqual(
      client.connectConfig.privateKey?.toString(), "TERMINAL-KEY",
      "the terminal must load the private key itself"
    );
    assert.strictEqual(
      client.connectConfig.readyTimeout, 10000,
      "the terminal handshake must be bounded"
    );
    assert.ok(
      !("privateKey" in keyHost),
      "resolving the key must not mutate the shared SSHConfig"
    );

    // A misconfigured key path surfaces in the terminal instead of hanging.
    created.length = 0;
    clients.length = 0;
    const broken = new XtermTerminal();
    const badHost = {
      username: "root", host: "10.0.0.6", port: 22,
      privateKeyPath: path.join(tmpDir, "missing")
    };
    const brokenOpen = broken.openPath(badHost, "/z");
    created[0].emitter.emit("initTerminal", { cols: 80, rows: 24 });
    assert.strictEqual(await brokenOpen, undefined, "a bad key path must not hang the open");
    const errors = created[0].panel.posted.filter((m) => m.type === "ssherror");
    assert.strictEqual(errors.length, 1, "the key error should be shown in the terminal");
    assert.match(errors[0].content, /Private key file not found/);
  } finally {
    fsMod.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("sshTerminalSession: all assertions passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
