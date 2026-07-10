const assert = require("assert");
const { requireTs } = require("./testSetup");
const { Neo4jConnection, serializeNeo4jValue } = requireTs("src/service/connect/neo4jConnection.ts");

function record(values) {
  return {
    keys: Object.keys(values),
    get: (key) => values[key],
    toObject: () => values,
  };
}

function integer(value, safe = true) {
  return {
    low: value,
    high: 0,
    toNumber: () => value,
    inSafeRange: () => safe,
    toString: () => String(value),
  };
}

(async () => {
  const calls = [];
  const fakeDriver = {
    verifyConnectivity: async () => calls.push(["verifyConnectivity"]),
    session: (options) => ({
      run: async (cypher) => {
        calls.push(["run", options, cypher]);
        if (cypher.startsWith("SHOW DATABASES")) {
          return { records: [record({ name: "neo4j" }), record({ name: "system" })] };
        }
        if (cypher.includes("db.labels")) {
          return { records: [record({ label: "Person" }), record({ label: "Movie" })] };
        }
        if (cypher.includes("db.relationshipTypes")) {
          return { records: [record({ relationshipType: "ACTED_IN" })] };
        }
        if (cypher.includes("RETURN event")) {
          return { records: [record({ event: "stream-a" }), record({ event: "stream-b" })] };
        }
        return {
          records: [
            record({
              name: "Keanu",
              born: integer(1964),
              node: {
                identity: integer(1),
                labels: ["Person"],
                properties: { name: "Keanu", views: integer(9007199254740992, false) },
                elementId: "1",
              },
            }),
          ],
        };
      },
      close: async () => calls.push(["sessionClose"]),
    }),
    close: async () => calls.push(["driverClose"]),
  };

  const created = [];
  const connection = new Neo4jConnection(
    { database: "movies", user: "neo4j", password: "secret" },
    (uri, auth, options) => {
      created.push({ uri, auth, options });
      return fakeDriver;
    },
    { basic: (user, password) => ({ user, password }) }
  );

  await new Promise((resolve, reject) => connection.connect((err) => err ? reject(err) : resolve()));
  assert.strictEqual(connection.isAlive(), true);
  assert.strictEqual(created[0].uri, "bolt://127.0.0.1:7687");
  assert.deepStrictEqual(created[0].auth, { user: "neo4j", password: "secret" });
  assert.strictEqual(created[0].options.connectionAcquisitionTimeout, 5000);
  assert.strictEqual(created[0].options.maxTransactionRetryTime, 10000);

  await new Promise((resolve, reject) => {
    connection.query("MATCH (n) RETURN n.name AS name", (err, rows, fields, total) => {
      if (err) return reject(err);
      assert.deepStrictEqual(rows, [{
        name: "Keanu",
        born: 1964,
        node: {
          identity: 1,
          labels: ["Person"],
          properties: { name: "Keanu", views: "9007199254740992" },
          elementId: "1",
        },
      }]);
      assert.deepStrictEqual(fields.map((field) => field.name), ["name", "born", "node"]);
      assert.strictEqual(total, 1);
      resolve();
    });
  });

  const streamed = [];
  await new Promise((resolve, reject) => {
    const emitter = connection.query("MATCH (event) RETURN event");
    emitter.on("result", (row, done) => {
      streamed.push({ row, done: !!done });
    });
    emitter.on("end", resolve);
    emitter.on("error", reject);
  });
  assert.deepStrictEqual(streamed, [
    { row: { event: "stream-a" }, done: false },
    { row: { event: "stream-b" }, done: true },
  ]);

  assert.deepStrictEqual(await connection.listDatabases(), ["neo4j", "system"]);
  assert.deepStrictEqual(await connection.listLabels(), ["Movie", "Person"]);
  assert.deepStrictEqual(await connection.listRelationshipTypes(), ["ACTED_IN"]);

  const fallbackConnection = new Neo4jConnection(
    { database: "fallback" },
    () => ({
      verifyConnectivity: async () => {},
      session: () => ({
        run: async () => { throw new Error("permission denied"); },
        close: async () => {},
      }),
      close: async () => {},
    }),
    { basic: (user, password) => ({ user, password }) }
  );
  assert.deepStrictEqual(await fallbackConnection.listDatabases(), ["fallback"]);

  assert.deepStrictEqual(serializeNeo4jValue({
    identity: integer(7),
    type: "ACTED_IN",
    start: integer(1),
    end: integer(2),
    properties: { roles: ["Neo"] },
    elementId: "7",
    startNodeElementId: "1",
    endNodeElementId: "2",
  }), {
    identity: 7,
    type: "ACTED_IN",
    start: 1,
    end: 2,
    properties: { roles: ["Neo"] },
    elementId: "7",
    startNodeElementId: "1",
    endNodeElementId: "2",
  });

  await new Promise((resolve, reject) => connection.beginTransaction((err) => err ? reject(err) : resolve()));
  connection.rollback();
  connection.commit();
  connection.end();
  assert.strictEqual(connection.isAlive(), false);
  assert.ok(calls.some((call) => call[0] === "driverClose"));

  console.log("neo4jConnection tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
