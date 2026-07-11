const RAW_SQL_FIELD = "__raw_sql__";

const PAGE_PATTERN = /\s+(LIMIT\s+\d+(?:\s*,\s*\d+)?(?:\s+OFFSET\s+\d+)?|OFFSET\s+\d+\s+ROWS\s+FETCH\s+NEXT\s+\d+\s+ROWS\s+ONLY)\s*;?\s*$/i;

// Trailing clauses after FROM must keep SQL order:
// WHERE -> GROUP BY -> HAVING -> ORDER BY -> LIMIT/OFFSET
const TRAILING_CLAUSE_PATTERN =
  /\s+\b(where|group\s+by|having|order\s+by)\b\s+[\s\S]+$/i;

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

function extractTrailingClauses(sql) {
  const normalized = normalizeSql(sql);
  const match = normalized.match(TRAILING_CLAUSE_PATTERN);
  if (!match) {
    return {
      core: normalized,
      where: "",
      groupBy: "",
      having: "",
      orderBy: "",
    };
  }

  const core = normalized.slice(0, match.index).trim();
  const trailing = normalized.slice(match.index).trim();
  const clauseStarts = [];
  const clauseRegex = /\b(where|group\s+by|having|order\s+by)\b/gi;
  let clauseMatch;
  while ((clauseMatch = clauseRegex.exec(trailing)) !== null) {
    clauseStarts.push({
      keyword: clauseMatch[1].replace(/\s+/g, " ").toUpperCase(),
      index: clauseMatch.index,
      keywordLength: clauseMatch[0].length,
    });
  }

  const clauses = {
    where: "",
    groupBy: "",
    having: "",
    orderBy: "",
  };

  for (let i = 0; i < clauseStarts.length; i++) {
    const current = clauseStarts[i];
    const next = clauseStarts[i + 1];
    const valueStart = current.index + current.keywordLength;
    const valueEnd = next ? next.index : trailing.length;
    const value = trailing.slice(valueStart, valueEnd).trim();
    if (!value) {
      continue;
    }

    if (current.keyword === "WHERE") {
      clauses.where = value;
    } else if (current.keyword === "GROUP BY") {
      clauses.groupBy = value;
    } else if (current.keyword === "HAVING") {
      clauses.having = value;
    } else if (current.keyword === "ORDER BY") {
      clauses.orderBy = value;
    }
  }

  return {
    core,
    ...clauses,
  };
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
  const clauses = extractTrailingClauses(parts.body);
  const whereExpression = clauses.where
    ? `${clauses.where} AND ${expressions.join(" AND ")}`
    : expressions.join(" AND ");

  const rebuilt = [
    clauses.core,
    `WHERE ${whereExpression}`,
    clauses.groupBy ? `GROUP BY ${clauses.groupBy}` : "",
    clauses.having ? `HAVING ${clauses.having}` : "",
    clauses.orderBy ? `ORDER BY ${clauses.orderBy}` : "",
    parts.paging || "",
  ]
    .filter(Boolean)
    .join(" ");

  return `${rebuilt};`;
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
