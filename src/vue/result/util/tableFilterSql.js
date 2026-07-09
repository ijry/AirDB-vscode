const RAW_SQL_FIELD = "__raw_sql__";

const PAGE_PATTERN = /\s+(LIMIT\s+\d+(?:\s*,\s*\d+)?(?:\s+OFFSET\s+\d+)?|OFFSET\s+\d+\s+ROWS\s+FETCH\s+NEXT\s+\d+\s+ROWS\s+ONLY)\s*;?\s*$/i;

function normalizeSql(sql) {
  return String(sql || "").trim().replace(/;+\s*$/, "");
}

function splitPaging(sql) {
  const normalized = normalizeSql(sql);
  const match = normalized.match(PAGE_PATTERN);
  if (!match) {
    return { body: normalized, paging: "" };
  }
  return {
    body: normalized.slice(0, match.index).trim(),
    paging: match[1].trim(),
  };
}

function stripExistingWhere(sql) {
  return sql.replace(/\s+\bwhere\b\s+.+$/i, "").trim();
}

function createDefaultFilterRow(fields) {
  const firstField = Array.isArray(fields) && fields.length > 0 ? fields[0].name : RAW_SQL_FIELD;
  return {
    enabled: true,
    field: firstField || RAW_SQL_FIELD,
    operator: "=",
    value: "",
  };
}

function isEmptyValue(row) {
  return row.value === undefined || row.value === null || String(row.value).trim() === "";
}

function buildConditionExpression(row, dbType, wrapColumn, quoteValue) {
  if (!row || row.enabled === false) {
    return "";
  }

  const field = row.field;
  const operator = row.operator || "=";

  if (field === RAW_SQL_FIELD) {
    if (isEmptyValue(row)) {
      return "";
    }
    return `(${String(row.value).trim()})`;
  }

  if (!field) {
    return "";
  }

  const column = wrapColumn(field, dbType);
  if (operator === "IS NULL" || operator === "IS NOT NULL") {
    return `${column} ${operator}`;
  }

  if (isEmptyValue(row)) {
    return "";
  }

  const valueText = String(row.value).trim();
  const quoted = valueText.toUpperCase() === "NULL" ? "null" : quoteValue(row.type, row.value);

  return `${column} ${operator} ${quoted}`;
}

function buildTableFilterSql(baseSql, rows, dbType, wrapColumn, quoteValue) {
  const expressions = (rows || [])
    .map((row) => buildConditionExpression(row, dbType, wrapColumn, quoteValue))
    .filter((expression) => expression);

  if (expressions.length === 0) {
    return `${normalizeSql(baseSql)};`;
  }

  const parts = splitPaging(baseSql);
  const baseBody = stripExistingWhere(parts.body);
  const paging = parts.paging ? ` ${parts.paging}` : "";
  return `${baseBody} WHERE ${expressions.join(" AND ")}${paging};`;
}

function selectRowsForConditionApply(rows, rowIndex) {
  const sourceRows = Array.isArray(rows) ? rows : [];

  if (typeof rowIndex === "number") {
    return sourceRows.map((row, index) => ({
      ...row,
      enabled: index === rowIndex ? row.enabled !== false : false,
    }));
  }

  return sourceRows
    .filter((row) => row && row.enabled !== false)
    .map((row) => ({ ...row }));
}

module.exports = {
  RAW_SQL_FIELD,
  createDefaultFilterRow,
  buildConditionExpression,
  buildTableFilterSql,
  selectRowsForConditionApply,
};
