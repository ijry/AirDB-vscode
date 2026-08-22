// Guards against reintroducing credential leaks.
//
// Each of these shipped at some point and each puts a secret somewhere a third
// party can read it: the notification centre, the output channel users paste into
// bug reports, and the webview devtools console.
process.chdir(__dirname + "/..");

const assert = require("assert");
const fs = require("fs");
const path = require("path");

function code(rel) {
  return fs
    .readFileSync(path.resolve(__dirname, "..", rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

// 1. The main password is the AES key for every synced connection password.
//    Echoing it into a notification leaks it to the notification centre,
//    screenshots and screen shares.
{
  const source = code("src/service/user/UserCenterService.ts");
  const shows = source.match(/show(Information|Error|Warning)Message\([^;]*/g) || [];
  for (const call of shows) {
    assert.ok(
      !/data\.pwd|mainPwd/.test(call),
      `the main password must not be shown to the user: ${call.slice(0, 120)}`
    );
  }
}

// 2. Console.log pops the output channel open, and the node carries password,
//    ssh credentials and cloud access keys.
{
  const source = code("src/service/connectionManager.ts");
  assert.ok(
    !/Console\.log\([^)]*JSON\.stringify\(opt\)/.test(source),
    "the full connection node must not be stringified into the output channel"
  );
}

// 3. The webview receives the node with plaintext credentials; logging it puts
//    them in the devtools console.
{
  const source = code("src/vue/connect/index.vue");
  const onEdit = source.slice(source.indexOf('.on("edit"'));
  const body = onEdit.slice(0, onEdit.indexOf('.on("connect"'));
  assert.ok(
    !/console\.log\(\s*node\s*\)/.test(body),
    "the connection node must not be logged in the webview console"
  );
}

// 4. syncState carries the auth token in state.userState.
for (const rel of ["src/vue/App.vue", "src/vue/result/App.vue"]) {
  const source = code(rel);
  assert.ok(
    !/console\.log\([^)]*['"]syncState['"][^)]*,\s*state/.test(source),
    `${rel}: syncState must not be logged -- it contains the auth token`
  );
}

console.log("credentialLeaks: all assertions passed");
