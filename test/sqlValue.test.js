// Tests for SQL value handling: bind values, literal escaping, and the empty-cell
// semantics agreed for editing.
//
// Replaces the old wrapQuote, which returned any value containing parentheses
// verbatim (so a cell holding "(1) , price=0" rewrote a column the user never
// edited), escaped only single quotes and did so with a backslash (wrong on
// PostgreSQL/SQL Server/Oracle), ignored backslashes (on MySQL a trailing one could
// swallow the following WHERE clause), and mapped an emptied cell to '' for every
// column type (so clearing a number stored 0 under MySQL's default mode).
process.chdir(__dirname + "/..");

const assert = require("assert");
const setup = require("./testSetup.js");

const { toBindValue, quoteLiteral, isTextType, escapeStringBody, usesBackslashEscapes } =
  setup.requireTs("src/common/sqlValue.js");
const { supportsBindParameters, placeholder, placeholderStyle, PlaceholderStyle } =
  setup.requireTs("src/common/sqlDialect.js");

// ---------------------------------------------------------------------------
// 1. Empty cell: '' for text columns, NULL for everything else.
// ---------------------------------------------------------------------------
assert.strictEqual(toBindValue("varchar", ""), "", "an emptied text cell is an empty string");
assert.strictEqual(toBindValue("text", ""), "");
assert.strictEqual(toBindValue("json", ""), "");
assert.strictEqual(toBindValue("int", ""), null, "an emptied number cell is NULL, not 0");
assert.strictEqual(toBindValue("bigint", ""), null);
assert.strictEqual(toBindValue("decimal", ""), null);
assert.strictEqual(toBindValue("boolean", ""), null);
assert.strictEqual(toBindValue("date", ""), "", "date is text-shaped and round-trips as a string");
assert.strictEqual(toBindValue("int", null), null);
assert.strictEqual(toBindValue("varchar", "abc"), "abc");

// Same rule through the literal path.
assert.strictEqual(quoteLiteral("int", "", "MySQL"), "null", "clearing a number must not store 0");
assert.strictEqual(quoteLiteral("varchar", "", "MySQL"), "''");

// ---------------------------------------------------------------------------
// 2. No "function call" escape hatch: parentheses must not bypass quoting.
// ---------------------------------------------------------------------------
{
  const injected = quoteLiteral("varchar", "(1) , price=0", "MySQL");
  assert.ok(
    injected.startsWith("'") && injected.endsWith("'"),
    `a value with parentheses must stay a quoted literal, got: ${injected}`
  );
  assert.ok(
    !/price=0\s*$/.test(injected.replace(/'$/, "")) || /^'/.test(injected),
    "the value must not reach SQL as bare text"
  );
  // A legitimate value with parentheses must survive intact.
  assert.strictEqual(quoteLiteral("varchar", "Widget (Large)", "MySQL"), "'Widget (Large)'");
}

// ---------------------------------------------------------------------------
// 3. Quote escaping: doubled, which is valid everywhere.
// ---------------------------------------------------------------------------
assert.strictEqual(quoteLiteral("varchar", "it's", "PostgreSQL"), "'it''s'");
assert.strictEqual(quoteLiteral("varchar", "it's", "MySQL"), "'it''s'");
assert.strictEqual(quoteLiteral("varchar", "it's", "SqlServer"), "'it''s'");
assert.ok(
  !quoteLiteral("varchar", "it's", "PostgreSQL").includes("\\'"),
  "backslash-quote is not an escape on PostgreSQL"
);

// ---------------------------------------------------------------------------
// 4. Backslashes: escaped on the MySQL family, left alone on standard SQL.
// ---------------------------------------------------------------------------
assert.strictEqual(usesBackslashEscapes("MySQL"), true);
assert.strictEqual(usesBackslashEscapes("Doris"), true);
assert.strictEqual(usesBackslashEscapes("PostgreSQL"), false);
assert.strictEqual(usesBackslashEscapes("SqlServer"), false);
{
  // A trailing backslash used to escape the closing quote and let the literal run on.
  const mysql = quoteLiteral("varchar", "C:\\temp\\", "MySQL");
  assert.strictEqual(mysql, "'C:\\\\temp\\\\'", `got ${mysql}`);
  const body = mysql.slice(1, -1);
  const trailing = body.match(/\\*$/)[0].length;
  assert.strictEqual(trailing % 2, 0, "the literal must not end on an odd backslash run");

  // On PostgreSQL a backslash is an ordinary character; doubling would corrupt data.
  assert.strictEqual(quoteLiteral("varchar", "C:\\temp", "PostgreSQL"), "'C:\\temp'");
}

// ---------------------------------------------------------------------------
// 5. Numbers stay unquoted; non-numeric text in a numeric column is still quoted
//    rather than injected bare.
// ---------------------------------------------------------------------------
assert.strictEqual(quoteLiteral("int", "42", "MySQL"), "42");
assert.strictEqual(quoteLiteral("bigint", "9007199254740993", "MySQL"), "9007199254740993",
  "big integers must pass through as text without precision loss");
assert.strictEqual(quoteLiteral("decimal", "-1.5e3", "MySQL"), "-1.5e3");
{
  const bad = quoteLiteral("int", "1; DROP TABLE t", "MySQL");
  assert.ok(bad.startsWith("'"), `non-numeric text in a numeric column must be quoted, got: ${bad}`);
}

// ---------------------------------------------------------------------------
// 6. Type classification.
// ---------------------------------------------------------------------------
assert.strictEqual(isTextType("varchar"), true);
assert.strictEqual(isTextType("timestamp with time zone"), true);
assert.strictEqual(isTextType("longblob"), true);
assert.strictEqual(isTextType("int"), false);
assert.strictEqual(isTextType("double"), false);
assert.strictEqual(isTextType(undefined), true, "unknown types are quoted, which is the safe default");

// ---------------------------------------------------------------------------
// 7. Placeholder dialects reflect what each driver actually accepts.
// ---------------------------------------------------------------------------
assert.strictEqual(placeholder("MySQL", 0), "?");
assert.strictEqual(placeholder("PostgreSQL", 0), "$1");
assert.strictEqual(placeholder("PostgreSQL", 2), "$3");
assert.strictEqual(placeholder("Oracle", 1), ":2");
assert.strictEqual(placeholder("SQLite", 0), null);

assert.strictEqual(supportsBindParameters("MySQL"), true);
assert.strictEqual(supportsBindParameters("PostgreSQL"), true);
assert.strictEqual(supportsBindParameters("Redshift"), true);
assert.strictEqual(supportsBindParameters("DuckDB"), true);
// SQLite talks to the sqlite3 CLI over stdin, so there is no bind protocol.
assert.strictEqual(supportsBindParameters("SQLite"), false);
assert.strictEqual(supportsBindParameters("TDengine"), false);
assert.strictEqual(supportsBindParameters("ClickHouse"), false);
assert.strictEqual(supportsBindParameters("SqlServer"), false);
assert.strictEqual(placeholderStyle("Unknown"), PlaceholderStyle.NONE,
  "an unrecognised database must fall back to inlined literals, not silently drop values");

console.log("sqlValue: all assertions passed");
