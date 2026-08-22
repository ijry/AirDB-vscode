// Regression tests for port forwarding state and bind-error reporting.
//
// Two bugs, both user-visible in the forward panel:
//
//  1. ForwardService.tunelMark was an instance field, but ForwardService is a field
//     initializer on SSHConnectionNode and the tree rebuilds those nodes on every
//     refresh. The webview panel is reused, so after a refresh the panel talked to a
//     service that had forgotten its tunnels: every forward showed as stopped and
//     Stop did nothing while the port stayed bound.
//
//  2. tunnel() passed its callback as server.listen's third argument, which is a
//     'listening' listener called with no arguments. EADDRINUSE arrives as an
//     'error' event instead, so with nothing attached the caller's promise never
//     settled -- the panel button spun forever -- and node saw an uncaught error.
process.chdir(__dirname + "/..");

const assert = require("assert");
const net = require("net");
const setup = require("./testSetup.js");

const tunnel = require("../src/service/ssh/forward/tunnel.js");

// On the unfixed code the bind-error path never calls back, so this test would hang
// rather than fail. Fail fast instead of stalling the suite.
const watchdog = setTimeout(() => {
  console.error("portForwardState: timed out -- a callback never fired");
  process.exit(1);
}, 20000);
watchdog.unref?.();

(async () => {

  // -------------------------------------------------------------------------
  // 1. A bind failure must invoke the callback with an error, exactly once.
  // -------------------------------------------------------------------------
  const blocker = net.createServer();
  const port = await new Promise((resolve) => {
    blocker.listen(0, "127.0.0.1", () => resolve(blocker.address().port));
  });

  const bindResult = await new Promise((resolve) => {
    let calls = 0;
    const server = tunnel(
      {
        host: "127.0.0.1", port: 22, username: "u", password: "p",
        localHost: "127.0.0.1", localPort: port,
        dstHost: "127.0.0.1", dstPort: 3306,
      },
      (error) => { calls++; resolve({ error, calls }); }
    );
    // The returned server must not throw an uncaught 'error' either.
    server.on("error", () => {});
  });

  assert.ok(bindResult.error, "a port already in use must report an error");
  assert.match(
    String(bindResult.error.code || bindResult.error.message), /EADDRINUSE/,
    `expected EADDRINUSE, got ${bindResult.error.code || bindResult.error.message}`
  );
  assert.strictEqual(bindResult.calls, 1, "the callback must fire exactly once");

  await new Promise((r) => blocker.close(r));

  // -------------------------------------------------------------------------
  // 2. A successful bind must invoke the callback with no error and a live server.
  // -------------------------------------------------------------------------
  const okResult = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("listen callback never fired")), 4000);
    const server = tunnel(
      {
        host: "127.0.0.1", port: 22, username: "u", password: "p",
        localHost: "127.0.0.1", localPort: 0,
        dstHost: "127.0.0.1", dstPort: 3306,
      },
      (error, srv) => { clearTimeout(timer); resolve({ error, srv }); }
    );
    server.on("error", () => {});
  });

  assert.strictEqual(okResult.error, null, "a successful bind must report no error");
  assert.ok(okResult.srv, "the server should be handed back");
  await new Promise((r) => okResult.srv.close(r));

  // -------------------------------------------------------------------------
  // 3. Tunnel state must survive the tree rebuilding its nodes, which is what
  //    creating a second ForwardService models.
  // -------------------------------------------------------------------------
  const vscode = require("vscode");
  vscode.window.createWebviewPanel = () => ({
    webview: { html: "", onDidReceiveMessage() {}, postMessage() {} },
    onDidDispose() {}, reveal() {}, dispose() {},
  });

  const store = new Map();
  const { Util } = setup.requireTs("src/common/util.ts");
  Util.store = (k, v) => store.set(k, v);
  Util.getStore = (k) => store.get(k);

  const { ForwardService } = setup.requireTs("src/service/ssh/forward/forwardService.ts");

  const sshConfig = { host: "10.0.0.9", port: 22, username: "root", key: "k" };
  const forwardInfo = {
    name: "db", localHost: "127.0.0.1", localPort: 0,
    remoteHost: "127.0.0.1", remotePort: 3306,
  };

  const first = new ForwardService();
  await first.forward(sshConfig, forwardInfo);

  const listedByFirst = first.list(sshConfig);
  assert.strictEqual(listedByFirst.length, 1, "the forward should be stored");
  assert.strictEqual(listedByFirst[0].state, true, "a running forward should read as running");

  // The tree refreshed: SSHConnectionNode was rebuilt, so its ForwardService is new.
  const afterRefresh = new ForwardService();
  const listedAfter = afterRefresh.list(sshConfig);
  assert.strictEqual(
    listedAfter[0].state, true,
    "a running tunnel must still read as running after the tree rebuilds its nodes"
  );

  // ...and Stop from the rebuilt node must actually close it.
  afterRefresh.stop(listedAfter[0].id);
  assert.strictEqual(
    afterRefresh.list(sshConfig)[0].state, false,
    "Stop from a rebuilt node must actually stop the tunnel"
  );

  // -------------------------------------------------------------------------
  // 4. The database-connection tunnel (a separate copy of the same code, used
  //    when a connection goes over SSH) must report bind failures too. Without
  //    this the whole connection attempt hangs on a taken local port.
  // -------------------------------------------------------------------------
  const dbTunnel = require("../src/service/tunnel/tunnel-ssh.js");

  const blocker2 = net.createServer();
  const port2 = await new Promise((resolve) => {
    blocker2.listen(0, "127.0.0.1", () => resolve(blocker2.address().port));
  });

  const dbResult = await new Promise((resolve) => {
    let calls = 0;
    const server = dbTunnel(
      {
        host: "127.0.0.1", port: 22, username: "u", password: "p",
        localHost: "127.0.0.1", localPort: port2,
        dstHost: "127.0.0.1", dstPort: 3306,
      },
      (error) => { calls++; resolve({ error, calls }); }
    );
    server.on("error", () => {});
  });

  assert.ok(dbResult.error, "the db tunnel must report a bind failure");
  assert.match(
    String(dbResult.error.code || dbResult.error.message), /EADDRINUSE/,
    `expected EADDRINUSE, got ${dbResult.error.code || dbResult.error.message}`
  );
  assert.strictEqual(dbResult.calls, 1, "the db tunnel callback must fire exactly once");

  await new Promise((r) => blocker2.close(r));

  console.log("portForwardState: all assertions passed");
  clearTimeout(watchdog);
})().catch((err) => {
  clearTimeout(watchdog);
  console.error(err);
  process.exit(1);
});