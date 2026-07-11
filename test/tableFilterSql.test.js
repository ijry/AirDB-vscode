const assert = require("assert");
const {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
  buildConditionExpression,
  buildTableFilterSql,
  selectRowsForConditionApply,
} = require("../src/vue/result/util/tableFilterSql");

const wrapColumn = (name) => `\`${name}\``;
const quoteValue = (type, value) => {
  if (value === "EMPTY") return "''";
  if (value === "NULL") return "null";
  if (["int", "bigint", "decimal"].includes(type)) return value;
  return `'${String(value).replace(/'/g, "\\'")}'`;
};

assert.deepStrictEqual(createDefaultFilterRow([{ name: "uid" }]), {
  enabled: true,
  field: "uid",
  operator: "=",
  value: "",
});

assert.strictEqual(
  buildConditionExpression(
    { enabled: true, field: "uid", operator: "=", value: "2", type: "int" },
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "`uid` = 2"
);

assert.strictEqual(
  buildConditionExpression(
    { enabled: true, field: "name", operator: "LIKE", value: "%air%", type: "varchar" },
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "`name` LIKE '%air%'"
);

assert.strictEqual(
  buildConditionExpression(
    { enabled: true, field: "name", operator: "IS NULL", value: "ignored", type: "varchar" },
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "`name` IS NULL"
);

assert.strictEqual(
  buildConditionExpression(
    { enabled: true, field: RAW_SQL_FIELD, operator: "=", value: "uid is not null" },
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "(uid is not null)"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` LIMIT 100;",
    [
      { enabled: true, field: "uid", operator: "=", value: "2", type: "int" },
      { enabled: true, field: RAW_SQL_FIELD, operator: "=", value: "status = 1" },
    ],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` WHERE `uid` = 2 AND (status = 1) LIMIT 100;"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` WHERE `uid` = 1 LIMIT 100;",
    [{ enabled: true, field: "name", operator: "=", value: "AirDB", type: "varchar" }],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` WHERE `uid` = 1 AND `name` = 'AirDB' LIMIT 100;"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` LIMIT 100;",
    [{ enabled: false, field: "uid", operator: "=", value: "2", type: "int" }],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` LIMIT 100;"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM xy_circle_user_profile ORDER BY id asc LIMIT 100;",
    [{ enabled: true, field: "gid", operator: "=", value: "1", type: "int" }],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM xy_circle_user_profile WHERE `gid` = 1 ORDER BY id asc LIMIT 100;"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` WHERE status = 1 ORDER BY id desc LIMIT 50;",
    [{ enabled: true, field: "uid", operator: "=", value: "2", type: "int" }],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` WHERE status = 1 AND `uid` = 2 ORDER BY id desc LIMIT 50;"
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT name, COUNT(*) AS c FROM `demo` WHERE status = 1 GROUP BY name HAVING COUNT(*) > 1 ORDER BY c desc LIMIT 20;",
    [{ enabled: true, field: "type", operator: "=", value: "A", type: "varchar" }],
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT name, COUNT(*) AS c FROM `demo` WHERE status = 1 AND `type` = 'A' GROUP BY name HAVING COUNT(*) > 1 ORDER BY c desc LIMIT 20;"
);

const mixedConditionRows = [
  { enabled: true, field: "uid", operator: "=", value: "2", type: "int" },
  { enabled: false, field: "name", operator: "=", value: "AirDB", type: "varchar" },
  { field: "status", operator: "=", value: "1", type: "int" },
];

assert.deepStrictEqual(
  selectRowsForConditionApply(mixedConditionRows),
  [
    { enabled: true, field: "uid", operator: "=", value: "2", type: "int" },
    { field: "status", operator: "=", value: "1", type: "int" },
  ]
);

assert.deepStrictEqual(
  selectRowsForConditionApply(mixedConditionRows, 1),
  [
    { enabled: false, field: "uid", operator: "=", value: "2", type: "int" },
    { enabled: false, field: "name", operator: "=", value: "AirDB", type: "varchar" },
    { enabled: false, field: "status", operator: "=", value: "1", type: "int" },
  ]
);

assert.deepStrictEqual(
  selectRowsForConditionApply(mixedConditionRows, 2),
  [
    { enabled: false, field: "uid", operator: "=", value: "2", type: "int" },
    { enabled: false, field: "name", operator: "=", value: "AirDB", type: "varchar" },
    { enabled: true, field: "status", operator: "=", value: "1", type: "int" },
  ]
);

assert.strictEqual(
  buildTableFilterSql(
    "SELECT * FROM `demo` LIMIT 100;",
    selectRowsForConditionApply(mixedConditionRows),
    "MySQL",
    wrapColumn,
    quoteValue
  ),
  "SELECT * FROM `demo` WHERE `uid` = 2 AND `status` = 1 LIMIT 100;"
);

console.log("tableFilterSql tests passed");
