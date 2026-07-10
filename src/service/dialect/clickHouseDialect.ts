import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class ClickHouseDialect extends SqlDialect {
    showSchemas(): string {
        return "SELECT name AS schema FROM system.databases ORDER BY name";
    }

    showDatabases(): string {
        return "SELECT name AS `Database` FROM system.databases ORDER BY name";
    }

    showTables(database: string): string {
        return `SELECT name, comment, total_rows AS rows, engine AS row_format FROM system.tables WHERE database = '${database}' AND is_temporary = 0 AND engine != 'View' ORDER BY name`;
    }

    showViews(database: string): string {
        return `SELECT name FROM system.tables WHERE database = '${database}' AND engine = 'View' ORDER BY name`;
    }

    showColumns(database: string, table: string): string {
        return `SELECT name, type, type AS simpleType, comment, '' AS \`key\`, 'YES' AS nullable, default_expression AS defaultValue, '' AS extra FROM system.columns WHERE database = '${database}' AND table = '${table}' ORDER BY position`;
    }

    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT * FROM ${database}.${table} LIMIT ${pageSize}`;
    }

    countSql(database: string, table: string): string {
        return `SELECT count(*) count FROM ${database}.${table}`;
    }

    createDatabase(database: string): string {
        return `CREATE DATABASE ${database}`;
    }

    showTableSource(database: string, table: string): string {
        return `SHOW CREATE TABLE ${database}.${table}`;
    }

    showViewSource(database: string, table: string): string {
        return `SHOW CREATE VIEW ${database}.${table}`;
    }

    showUsers(): string {
        return "SELECT name AS user FROM system.users ORDER BY name";
    }

    processList(): string {
        return "SELECT query_id, user, address, elapsed, query FROM system.processes";
    }

    variableList(): string {
        return "SELECT name, value FROM system.settings ORDER BY name";
    }

    statusList(): string {
        return "SELECT metric AS name, value FROM system.metrics ORDER BY metric";
    }

    pingDataBase(database: string): string {
        return database ? `SELECT 1 FROM system.databases WHERE name='${database}'` : "SELECT 1";
    }

    truncateDatabase(database: string): string {
        return `SELECT concat('TRUNCATE TABLE ', database, '.', name) trun FROM system.tables WHERE database='${database}' AND engine != 'View'`;
    }

    updateTable(update: UpdateTableParam): string {
        if (update.newTableName && update.table != update.newTableName) {
            return `RENAME TABLE ${update.table} TO ${update.newTableName}`;
        }
        return "";
    }

    addColumn(table: string): string {
        return `ALTER TABLE ${table} ADD COLUMN [column] [type];`;
    }

    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        return `ALTER TABLE ${table} MODIFY COLUMN ${column} ${type};`;
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    id UInt64,
    [column] String
) ENGINE = MergeTree()
ORDER BY id;`;
    }

    viewTemplate(): string {
        return `CREATE VIEW [name] AS
SELECT * FROM ...;`;
    }

    createUser(): string { return "CREATE USER username IDENTIFIED BY 'password';"; }
    showTriggers(): string { return "SELECT '' AS TRIGGER_NAME WHERE 1 = 0"; }
    showProcedures(): string { return "SELECT '' AS ROUTINE_NAME WHERE 1 = 0"; }
    showFunctions(): string { return "SELECT name AS ROUTINE_NAME FROM system.functions WHERE 1 = 0"; }
    showProcedureSource(): string { throw new Error("ClickHouse does not support procedures."); }
    showFunctionSource(): string { throw new Error("ClickHouse function source is not supported."); }
    showTriggerSource(): string { throw new Error("ClickHouse does not support triggers."); }
    procedureTemplate(): string { throw new Error("ClickHouse does not support procedures."); }
    triggerTemplate(): string { throw new Error("ClickHouse does not support triggers."); }
    functionTemplate(): string { throw new Error("ClickHouse function templates are not supported."); }
}
