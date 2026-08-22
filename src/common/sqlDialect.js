/**
 * Placeholder syntax per database, used to decide whether an edit statement can be
 * sent with bind parameters or has to fall back to inlined literals.
 *
 * Derived from what each IConnection implementation actually forwards to its
 * driver, not from the overload signatures -- several implementations accept a
 * `values` argument and drop it.
 */

/** `?` positional placeholders (mysql2, dameng, snowflake, duckdb). */
const QUESTION = 'question';
/** `$1`-style ordinals (node-postgres and its forks). */
const ORDINAL = 'ordinal';
/** `:1`-style ordinals (oracledb). */
const COLON = 'colon';
/** Cannot bind: statements must carry inlined literals. */
const NONE = 'none';

const DIALECTS = {
    MySQL: QUESTION,
    Doris: QUESTION,
    DaMeng: QUESTION,
    Snowflake: QUESTION,
    DuckDB: QUESTION,
    PostgreSQL: ORDINAL,
    Redshift: ORDINAL,
    KingbaseES: ORDINAL,
    Oracle: COLON,

    // Deliberately unbindable:
    //  - SQLite runs through the sqlite3 CLI (src/service/connect/sqlite/index.ts),
    //    writing statement text to stdin; there is no bind protocol to reach.
    //  - TDengine's query API takes (sql, reqId) only.
    //  - ClickHouse supports named {n:Type} parameters, a different syntax, and its
    //    DML is ALTER TABLE ... UPDATE rather than plain UPDATE.
    //  - SqlServer needs an explicit tedious type per parameter; not wired yet.
    SQLite: NONE,
    TDengine: NONE,
    ClickHouse: NONE,
    SqlServer: NONE,
    ElasticSearch: NONE,
    MongoDB: NONE,
};

export const PlaceholderStyle = { QUESTION, ORDINAL, COLON, NONE };

/** Placeholder style for a database, defaulting to "cannot bind". */
export function placeholderStyle(databaseType) {
    return DIALECTS[databaseType] || NONE;
}

/** True when edit statements for this database can carry bind parameters. */
export function supportsBindParameters(databaseType) {
    return placeholderStyle(databaseType) !== NONE;
}

/**
 * Placeholder text for the given zero-based parameter position.
 * Callers must append values in the same order.
 */
export function placeholder(databaseType, index) {
    switch (placeholderStyle(databaseType)) {
        case ORDINAL:
            return `$${index + 1}`;
        case COLON:
            return `:${index + 1}`;
        case QUESTION:
            return '?';
        default:
            return null;
    }
}
