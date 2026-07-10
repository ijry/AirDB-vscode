const assert = require("assert");
const { requireTs } = require("./testSetup");

const {
  ClickHouseConnection,
  createClickHouseConfig,
} = requireTs("src/service/connect/clickHouseConnection.ts");
const { DuckDBConnection } = requireTs("src/service/connect/duckdbConnection.ts");
const {
  RabbitMQConnection,
  createRabbitMQAmqpUrl,
  createRabbitMQManagementUrl,
} = requireTs("src/service/connect/rabbitmqConnection.ts");

assert.deepStrictEqual(createClickHouseConfig({
  host: "ch.local",
  port: 8123,
  user: "alice",
  password: "secret",
  database: "analytics",
}).url, "http://ch.local:8123");

assert.strictEqual(
  createRabbitMQAmqpUrl({
    host: "mq.local",
    port: 5672,
    user: "guest",
    password: "guest",
    database: "/airdb",
  }),
  "amqp://guest:guest@mq.local:5672/%2Fairdb"
);
assert.strictEqual(createRabbitMQManagementUrl({ host: "mq.local" }), "http://mq.local:15672/api");

(async () => {
  const clickHouseCalls = [];
  const clickHouse = new ClickHouseConnection({
    host: "localhost",
    port: 8123,
    dbType: "ClickHouse",
  }, (config) => {
    clickHouseCalls.push(["factory", config]);
    return {
      ping: async () => ({ success: true }),
      query: async ({ query, format }) => {
        clickHouseCalls.push(["query", query, format]);
        return { json: async () => [{ answer: 1 }] };
      },
      close: () => clickHouseCalls.push(["close"]),
    };
  });
  await new Promise((resolve, reject) => clickHouse.connect((err) => err ? reject(err) : resolve()));
  assert.strictEqual(clickHouse.isAlive(), true);
  await new Promise((resolve, reject) => {
    clickHouse.query("select 1 answer", (err, rows, fields) => {
      if (err) return reject(err);
      assert.deepStrictEqual(rows, [{ answer: 1 }]);
      assert.strictEqual(fields[0].name, "answer");
      resolve();
    });
  });
  clickHouse.end();
  assert.deepStrictEqual(clickHouseCalls.map((call) => call[0]), ["factory", "query", "close"]);

  const duckCalls = [];
  const duck = new DuckDBConnection({ dbPath: "demo.duckdb", dbType: "DuckDB" }, (dbPath) => {
    duckCalls.push(["factory", dbPath]);
    return {
      connect: () => ({
        all: (sql, callback) => {
          duckCalls.push(["all", sql]);
          callback(null, [{ name: "orders" }]);
        },
        close: () => duckCalls.push(["connection.close"]),
      }),
      close: () => duckCalls.push(["db.close"]),
    };
  });
  await new Promise((resolve, reject) => duck.connect((err) => err ? reject(err) : resolve()));
  await new Promise((resolve, reject) => {
    duck.query("select 'orders' name", (err, rows, fields) => {
      if (err) return reject(err);
      assert.deepStrictEqual(rows, [{ name: "orders" }]);
      assert.strictEqual(fields[0].name, "name");
      resolve();
    });
  });
  duck.end();
  assert.deepStrictEqual(duckCalls.map((call) => call[0]), ["factory", "all", "connection.close", "db.close"]);

  const amqpCalls = [];
  const managementCalls = [];
  const rabbit = new RabbitMQConnection(
    { host: "localhost", user: "guest", password: "guest", database: "/", dbType: "RabbitMQ" },
    async (url) => {
      amqpCalls.push(["connect", url]);
      return {
        createChannel: async () => ({
          sendToQueue: (queue, payload, options) => {
            amqpCalls.push(["sendToQueue", queue, payload.toString(), options.persistent]);
            return true;
          },
          close: async () => amqpCalls.push(["channel.close"]),
        }),
        close: async () => amqpCalls.push(["connection.close"]),
      };
    },
    {
      get: async (url) => {
        managementCalls.push(["get", url]);
        return { data: [{ name: "jobs" }] };
      },
      post: async (url, payload) => {
        managementCalls.push(["post", url, payload.count, payload.ackmode]);
        return { data: [{ payload: "hello", routing_key: "jobs" }] };
      },
    }
  );
  await new Promise((resolve, reject) => rabbit.connect((err) => err ? reject(err) : resolve()));
  assert.deepStrictEqual(await rabbit.listQueues(), [{ name: "jobs" }]);
  assert.deepStrictEqual(await rabbit.getMessages("jobs", 1, true), [{ payload: "hello", routing_key: "jobs" }]);
  assert.strictEqual(await rabbit.publishMessage({ queue: "jobs", payload: "hello" }), true);
  rabbit.end();
  assert.deepStrictEqual(managementCalls, [
    ["get", "/queues/%2F"],
    ["post", "/queues/%2F/jobs/get", 1, "ack_requeue_true"],
  ]);
  assert.strictEqual(amqpCalls[1][0], "sendToQueue");

  console.log("multiBackendConnection tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
