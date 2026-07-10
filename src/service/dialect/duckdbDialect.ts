import { SqliTeDialect } from "./sqliteDialect";

export class DuckDBDialect extends SqliTeDialect {
    showTables(database: string): string {
        return "SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'BASE TABLE' ORDER BY table_name";
    }

    showViews(database: string): string {
        return "SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type = 'VIEW' ORDER BY table_name";
    }

    showColumns(database: string, table: string): string {
        return `PRAGMA table_info('${table}')`;
    }

    showTableSource(database: string, table: string): string {
        return `SELECT sql AS "Create Table" FROM duckdb_tables() WHERE table_name='${table}'`;
    }

    showViewSource(database: string, table: string): string {
        return `SELECT sql AS "Create View" FROM duckdb_views() WHERE view_name='${table}'`;
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    id BIGINT PRIMARY KEY,
    [column] VARCHAR
);`;
    }
}
