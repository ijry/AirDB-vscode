/**
 * SQL value handling shared by the webview (which builds edit statements) and the
 * extension (which executes them).
 *
 * Two callers, one set of rules:
 *   - `toBindValue` converts a cell's text into the value handed to a driver as a
 *     bind parameter. Preferred: no quoting or escaping is involved at all.
 *   - `quoteLiteral` inlines a value into SQL for the drivers that cannot bind
 *     (sqlite runs through the sqlite3 CLI, TDengine and ClickHouse take no
 *     positional parameters). This is the fallback, not the default.
 */

/** Types whose values are written as quoted text. */
const TEXT_TYPES = new Set([
    // sql server
    'nvarchar', 'nchar', 'ntext', 'datetimeoffset', 'smalldatetime', 'datetime2', 'uniqueidentifier',
    // postgres
    'character', 'character varying', 'xml', 'uuid', 'json', 'jsonb', 'name',
    'timestamp with time zone', 'timestamp without time zone', 'time with time zone',
    'interval', 'inet', 'cidr', 'macaddr',
    // mysql / general
    'varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext',
    'date', 'time', 'timestamp', 'datetime', 'year', 'set', 'enum',
]);

/** Substrings that also indicate a text-shaped type (blob/binary included). */
const TEXT_LIKE_PATTERNS = ['char', 'text', 'blob', 'binary', 'clob', 'timestamp', 'date', 'time', 'json', 'uuid', 'xml'];

/**
 * True when a value of this type is written as quoted text. Unknown types are
 * treated as text: quoting a number harmlessly still compares equal in every
 * supported database, whereas leaving a string bare is a syntax error.
 */
export function isTextType(type) {
    if (!type) { return true; }
    const normalized = String(type).toLowerCase().trim();
    if (TEXT_TYPES.has(normalized)) { return true; }
    return TEXT_LIKE_PATTERNS.some((pattern) => normalized.indexOf(pattern) !== -1);
}

/**
 * Interprets a cell's edited text as a value to store.
 *
 * An emptied cell means an empty string for text columns, but NULL for numeric,
 * boolean and other non-text columns: those have no empty-string value, and
 * sending '' made MySQL coerce it to 0 (or the zero date) in its default
 * non-strict mode, so clearing a number silently stored 0.
 */
export function toBindValue(type, value) {
    if (value === null || value === undefined) { return null; }
    if (value === '') {
        return isTextType(type) ? '' : null;
    }
    return value;
}

/**
 * Escapes a value for inlining into SQL. Only for drivers that cannot bind
 * parameters; prefer `toBindValue` with a real placeholder everywhere else.
 *
 * Deliberately has no "looks like a function call" escape hatch: the previous
 * implementation returned any value containing parentheses verbatim, so a cell
 * containing `(1) , price=0` rewrote a column the user never edited.
 */
export function quoteLiteral(type, value, databaseType) {
    const bound = toBindValue(type, value);
    if (bound === null) { return 'null'; }
    if (typeof bound === 'boolean') { return bound ? 'true' : 'false'; }
    if (typeof bound === 'number') {
        return Number.isFinite(bound) ? String(bound) : 'null';
    }

    const text = String(bound);
    if (!isTextType(type)) {
        // Numeric-shaped column: only emit it bare when it really is a number,
        // otherwise quote it and let the database reject or cast it.
        if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(text)) {
            return text;
        }
    }
    return `'${escapeStringBody(text, databaseType)}'`;
}

/**
 * Escapes the inside of a single-quoted SQL string.
 *
 * Doubling the quote is the standard-SQL form and is accepted everywhere. The old
 * code emitted a backslash escape instead, which is wrong on PostgreSQL (with the
 * default standard_conforming_strings), SQL Server and Oracle -- there a value
 * like `it's` ended the literal early and spilled into the statement. It also left
 * backslashes untouched, so on MySQL a value ending in one escaped the closing
 * quote and could swallow the WHERE clause of the next statement.
 */
export function escapeStringBody(text, databaseType) {
    let escaped = String(text).replace(/'/g, "''");
    if (usesBackslashEscapes(databaseType)) {
        escaped = escaped.replace(/\\/g, '\\\\');
    }
    return escaped;
}

/**
 * MySQL-family servers treat backslash as an escape character inside string
 * literals by default; the standard-SQL databases do not.
 */
export function usesBackslashEscapes(databaseType) {
    return databaseType === 'MySQL'
        || databaseType === 'Doris'
        || databaseType === 'TDengine'
        || databaseType === 'ClickHouse';
}
