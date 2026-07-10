const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
assert.strictEqual(pkg.dependencies["node-zookeeper-client"], "^1.1.3");

const constants = read("src/common/constants.ts");
assert.match(constants, /ZOOKEEPER\s*=\s*"ZooKeeper"/);
assert.match(constants, /ZOOKEEPER_CONNECTION\s*=\s*"zookeeperConnection"/);
assert.match(constants, /ZOOKEEPER_ZNODE\s*=\s*"zookeeperZnode"/);

const node = read("src/model/interface/node.ts");
assert.match(node, /DatabaseType\.ZOOKEEPER/);
assert.match(node, /ModelType\.ZOOKEEPER_CONNECTION/);

const manager = read("src/service/connectionManager.ts");
assert.match(manager, /ZooKeeperConnection/);
assert.match(manager, /case DatabaseType\.ZOOKEEPER:/);
assert.match(manager, /return new ZooKeeperConnection\(opt\)/);

const tree = read("src/provider/treeDataProvider.ts");
assert.match(tree, /ZooKeeperConnectionNode/);
assert.match(tree, /dbType == DatabaseType\.ZOOKEEPER/);
assert.match(tree, /new ZooKeeperConnectionNode\(key, connectInfo\)/);

const extension = read("src/extension.ts");
assert.match(extension, /ZooKeeperZnodeNode/);
assert.match(extension, /"airdb\.zookeeper\.znode\.open": \(znodeNode: ZooKeeperZnodeNode\) => znodeNode\.open\(\)/);

assert.ok(pkg.contributes.commands.some((command) => command.command === "airdb.zookeeper.znode.open"));
assert.ok(
  pkg.contributes.menus["view/item/context"].some((menu) =>
    menu.command === "airdb.zookeeper.znode.open" && /zookeeperZnode/.test(menu.when)
  )
);
assert.ok(fs.existsSync(path.resolve(__dirname, "../resources/icon/zookeeper.svg")), "zookeeper icon exists");

console.log("zookeeperRegistration tests passed");
