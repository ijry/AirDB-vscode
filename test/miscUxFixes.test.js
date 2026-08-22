// Regression tests for a few smaller fixes.
//
//  - Kafka/RabbitMQ message panels passed singlePage: false alongside a type that
//    was already unique per topic/queue. ViewManager appends a timestamp when
//    singlePage is false, so the unique type never matched and every click opened
//    another identical tab.
//  - FileManager.show built a promise with no reject path, so a document that
//    could not be opened left every awaiting caller hanging.
//  - The sqlite driver dropped its "configure sqlite3" result instead of
//    returning it, then spawned undefined.
process.chdir(__dirname + "/..");

const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
}

/** Strips // and /* comments so assertions match code, not prose about the fix. */
function code(rel) {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// 1. Message panels must be reusable per topic/queue.
// ---------------------------------------------------------------------------
for (const rel of [
  "src/model/kafka/kafkaTopicNode.ts",
  "src/model/rabbitmq/rabbitmqQueueNode.ts",
]) {
  const source = code(rel);
  assert.ok(
    !/singlePage:\s*false/.test(source),
    `${rel}: singlePage: false defeats the per-topic type and opens a new tab per click`
  );
  // Each panel should still carry a type unique to its topic/queue.
  const types = source.match(/type:\s*`[^`]+`/g) || [];
  assert.ok(types.length >= 2, `${rel}: expected viewer and producer panel types`);
  for (const t of types) {
    assert.match(
      t, /\$\{this\.(topic|queue)\}/,
      `${rel}: panel type must be unique per topic/queue, got ${t}`
    );
  }
}

// ---------------------------------------------------------------------------
// 2. FileManager.show must be able to reject.
// ---------------------------------------------------------------------------
{
  const source = code("src/common/filesManager.ts");
  const show = source.slice(source.indexOf("public static show"));
  const body = show.slice(0, show.indexOf("public static record"));
  assert.match(
    body, /new Promise\(\(resolve,\s*reject\)/,
    "FileManager.show must expose reject, or a failed open hangs its callers forever"
  );
  assert.ok(
    /reject\)/.test(body) || /reject\(/.test(body),
    "the openTextDocument failure path must reject"
  );
}

// ---------------------------------------------------------------------------
// 3. The sqlite driver must not fall through to spawn() without a command.
// ---------------------------------------------------------------------------
{
  const source = code("src/service/connect/sqlite/index.ts");
  const guard = source.match(/if \(!this\.sqliteCommand\)[\s\S]{0,320}?\n\s*\}/);
  assert.ok(guard, "the missing-sqlite3 guard should still be present");
  assert.match(
    guard[0], /return\s+Promise\.(reject|resolve)/,
    "the guard must return, otherwise execution reaches spawn(undefined, ...)"
  );
}

console.log("miscUxFixes: all assertions passed");
