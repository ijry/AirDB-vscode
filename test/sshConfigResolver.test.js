const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { requireTs } = require("./testSetup");

const { resolvePrivateKey, buildConnectConfig } = requireTs("src/service/ssh/sshConfigResolver.ts");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "airdb-sshkey-"));
const keyPath = path.join(tmpDir, "id_rsa");
fs.writeFileSync(keyPath, "PRIVATE-KEY-BODY");

try {
  // No key configured -> password auth, nothing to resolve.
  assert.strictEqual(resolvePrivateKey({ host: "h", port: 22, username: "u" }), undefined);

  // Configured and readable -> contents returned.
  const resolved = resolvePrivateKey({ host: "h", port: 22, username: "u", privateKeyPath: keyPath });
  assert.ok(Buffer.isBuffer(resolved), "a readable key should come back as a Buffer");
  assert.strictEqual(resolved.toString(), "PRIVATE-KEY-BODY");

  // Explicit key auth -> resolved.
  assert.strictEqual(
    resolvePrivateKey({ host: "h", port: 22, username: "u", type: "privateKey", privateKeyPath: keyPath }).toString(),
    "PRIVATE-KEY-BODY"
  );

  // The connect form hides privateKeyPath when the user switches back to password
  // auth but keeps its value, so a leftover path must be ignored rather than
  // treated as key auth (or as a misconfiguration when the file is gone).
  assert.strictEqual(
    resolvePrivateKey({ host: "h", port: 22, username: "u", type: "password", privateKeyPath: keyPath }),
    undefined,
    "a leftover key path must be ignored for password auth"
  );
  assert.strictEqual(
    resolvePrivateKey({
      host: "h", port: 22, username: "u", type: "password",
      privateKeyPath: path.join(tmpDir, "long-gone")
    }),
    undefined,
    "a stale key path must not break an existing password connection"
  );

  // Configured but missing -> explicit error naming the path, instead of silently
  // falling through to password auth and failing later with an opaque message.
  assert.throws(
    () => resolvePrivateKey({ host: "h", port: 22, username: "u", privateKeyPath: path.join(tmpDir, "nope") }),
    /Private key file not found/,
    "a missing key file must be reported, not ignored"
  );
  assert.throws(
    () => resolvePrivateKey({
      host: "h", port: 22, username: "u", type: "privateKey",
      privateKeyPath: path.join(tmpDir, "nope")
    }),
    /Private key file not found/,
    "an explicit key-auth connection must report a missing key"
  );

  // buildConnectConfig bounds the handshake so a black-holed host cannot hang
  // with no feedback (ssh2 otherwise waits out its 20s default).
  const withKey = buildConnectConfig({ host: "h", port: 22, username: "u", privateKeyPath: keyPath });
  assert.strictEqual(withKey.readyTimeout, 10000, "handshake must have a bounded timeout");
  assert.strictEqual(withKey.privateKey.toString(), "PRIVATE-KEY-BODY");
  assert.strictEqual(withKey.host, "h", "the rest of the config must be preserved");

  // Password-only configs must not gain a privateKey key at all: passing
  // privateKey: undefined to ssh2 is not the same as omitting it.
  const passwordOnly = buildConnectConfig({ host: "h", port: 22, username: "u", password: "p" });
  assert.ok(!("privateKey" in passwordOnly), "password auth should not carry a privateKey field");
  assert.strictEqual(passwordOnly.readyTimeout, 10000);

  // The shared SSHConfig object must not be mutated: it is held by reference across
  // tree nodes, so caching the key onto it made one code path depend on another
  // having run first.
  const shared = { host: "h", port: 22, username: "u", privateKeyPath: keyPath };
  buildConnectConfig(shared);
  assert.ok(!("privateKey" in shared), "resolving a key must not mutate the shared config");

  console.log("sshConfigResolver: all assertions passed");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
