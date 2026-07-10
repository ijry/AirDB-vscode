const assert = require("assert");
const fs = require("fs");
const path = require("path");

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

const pkg = JSON.parse(read("package.json"));
assert.strictEqual(pkg.dependencies["neo4j-driver"], "^6.2.0");

const constants = read("src/common/constants.ts");
assert.match(constants, /NEO4J\s*=\s*"Neo4j"/);
assert.match(constants, /NEO4J_CONNECTION\s*=\s*"neo4jConnection"/);
assert.match(constants, /NEO4J_DATABASE_GROUP\s*=\s*"neo4jDatabaseGroup"/);
assert.match(constants, /NEO4J_DATABASE\s*=\s*"neo4jDatabase"/);
assert.match(constants, /NEO4J_LABEL_GROUP\s*=\s*"neo4jLabelGroup"/);
assert.match(constants, /NEO4J_LABEL\s*=\s*"neo4jLabel"/);
assert.match(constants, /NEO4J_RELATIONSHIP_GROUP\s*=\s*"neo4jRelationshipGroup"/);
assert.match(constants, /NEO4J_RELATIONSHIP\s*=\s*"neo4jRelationship"/);

const node = read("src/model/interface/node.ts");
assert.match(node, /DatabaseType\.NEO4J/);
assert.match(node, /ModelType\.NEO4J_CONNECTION/);

const manager = read("src/service/connectionManager.ts");
assert.match(manager, /Neo4jConnection/);
assert.match(manager, /case DatabaseType\.NEO4J:/);
assert.match(manager, /return new Neo4jConnection\(opt\)/);

const tree = read("src/provider/treeDataProvider.ts");
assert.match(tree, /Neo4jConnectionNode/);
assert.match(tree, /dbType == DatabaseType\.NEO4J/);
assert.match(tree, /new Neo4jConnectionNode\(key, connectInfo\)/);

assert.ok(fs.existsSync(path.resolve(__dirname, "../resources/icon/neo4j.svg")), "neo4j icon exists");
console.log("neo4jRegistration tests passed");
