import { AddColumnParam } from "./param/addColumnParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class TDengineDialect extends SqlDialect {
    showDatabases(): string {
        return "SELECT name AS `Database` FROM information_schema.ins_databases ORDER BY name;";
    }

    showSchemas(): string {
        return "SELECT name AS schema FROM information_schema.ins_databases ORDER BY name;";
    }

    pingDataBase(database: string): string {
        if (!database) return "SELECT 1";
        return `USE ${this.quoteIdentifier(database)}`;
    }

    createDatabase(database: string): string {
        return `CREATE DATABASE ${this.quoteIdentifier(database)}`;
    }

    truncateDatabase(database: string): string {
        return `SELECT CONCAT('TRUNCATE TABLE \\\`', db_name, '\\\`.\\\`', table_name, '\\\`;') trun
FROM information_schema.ins_tables
WHERE db_name = '${this.quoteLiteral(database)}'
ORDER BY table_name;`;
    }

    showTables(database: string): string {
        return `SELECT table_name AS name, table_comment AS comment, NULL AS rows
FROM information_schema.ins_tables
WHERE db_name = '${this.quoteLiteral(database)}'
ORDER BY table_name;`;
    }

    showColumns(database: string, table: string): string {
        return `SELECT col_name AS name, col_type AS simpleType, col_type AS type, NULL AS comment, '' AS \`key\`,
CASE WHEN col_nullable = 1 THEN 'YES' ELSE 'NO' END AS nullable,
col_length AS maxLength, NULL AS defaultValue, '' AS extra
FROM information_schema.ins_columns
WHERE db_name = '${this.quoteLiteral(database)}' AND table_name = '${this.quoteLiteral(table)}'
ORDER BY col_name;`;
    }

    showViews(_database: string): string {
        return "SELECT NULL AS name WHERE 1 = 0;";
    }

    showUsers(): string {
        return "SHOW USERS;";
    }

    createUser(): string {
        return "CREATE USER username PASS 'password';";
    }

    showTriggers(_database: string): string {
        return "SELECT NULL AS TRIGGER_NAME WHERE 1 = 0;";
    }

    showProcedures(_database: string): string {
        return "SELECT NULL AS ROUTINE_NAME WHERE 1 = 0;";
    }

    showFunctions(_database: string): string {
        return "SELECT NULL AS ROUTINE_NAME WHERE 1 = 0;";
    }

    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT * FROM ${this.qualifiedName(database, table)} LIMIT ${pageSize};`;
    }

    countSql(database: string, table: string): string {
        return `SELECT COUNT(*) FROM ${this.qualifiedName(database, table)};`;
    }

    updateTable(update: UpdateTableParam): string {
        const { table, newTableName } = update;
        if (newTableName && table != newTableName) {
            return `ALTER TABLE ${this.quoteIdentifier(table)} RENAME ${this.quoteIdentifier(newTableName)};`;
        }
        return "";
    }

    showTableSource(database: string, table: string): string {
        return `SHOW CREATE TABLE ${this.qualifiedName(database, table)};`;
    }

    showViewSource(_database: string, _table: string): string {
        return "";
    }

    showProcedureSource(_database: string, _name: string): string {
        return "";
    }

    showFunctionSource(_database: string, _name: string): string {
        return "";
    }

    showTriggerSource(_database: string, _name: string): string {
        return "";
    }

    addColumn(table: string): string {
        return `ALTER TABLE ${table} ADD COLUMN [column] [type];`;
    }

    addColumnSql(addColumnParam: AddColumnParam): string {
        return `ALTER TABLE ${addColumnParam.table} ADD COLUMN ${addColumnParam.columnName} ${addColumnParam.columnType};`;
    }

    updateColumn(table: string, column: string, type: string, _comment: string, _nullable: string): string {
        return `ALTER TABLE ${table} MODIFY COLUMN ${column} ${type};`;
    }

    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        return `ALTER TABLE ${updateColumnParam.table} MODIFY COLUMN ${updateColumnParam.columnName} ${updateColumnParam.columnType};`;
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    ts TIMESTAMP,
    [column] DOUBLE
);`;
    }

    viewTemplate(): string {
        return "";
    }

    procedureTemplate(): string {
        return "";
    }

    triggerTemplate(): string {
        return "";
    }

    functionTemplate(): string {
        return "";
    }

    processList(): string {
        return "SHOW QUERIES;";
    }

    variableList(): string {
        return "SHOW VARIABLES;";
    }

    statusList(): string {
        return "SHOW DNODES;";
    }

    private qualifiedName(database: string, table: string): string {
        if (!database) return this.quoteIdentifier(table);
        return `${this.quoteIdentifier(database)}.${this.quoteIdentifier(table)}`;
    }

    private quoteIdentifier(identifier: string): string {
        return `\`${String(identifier || "").replace(/`/g, "``")}\``;
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }
}
