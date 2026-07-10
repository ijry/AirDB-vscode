import { CreateIndexParam } from "./param/createIndexParam";
import { AddColumnParam } from "./param/addColumnParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class SnowflakeDialect extends SqlDialect {
    createIndex(createIndexParam: CreateIndexParam): string {
        return `CREATE INDEX ${this.quoteIdentifier(createIndexParam.column)}_${new Date().getTime()}_index ON ${createIndexParam.table} (${this.quoteIdentifier(createIndexParam.column)});`;
    }

    dropIndex(_table: string, indexName: string): string {
        return `DROP INDEX ${this.quoteIdentifier(indexName)}`;
    }

    showIndex(_database: string, _table: string): string {
        return "";
    }

    variableList(): string {
        return "SHOW PARAMETERS";
    }

    statusList(): string {
        return "SELECT CURRENT_ACCOUNT() ACCOUNT, CURRENT_REGION() REGION, CURRENT_VERSION() VERSION";
    }

    processList(): string {
        return `SELECT QUERY_ID "Id", USER_NAME "User", DATABASE_NAME "db", QUERY_TEXT "Info", EXECUTION_STATUS "State", START_TIME "Time"
FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY())
ORDER BY START_TIME DESC
LIMIT 100`;
    }

    addColumn(table: string): string {
        return `ALTER TABLE ${table} ADD COLUMN [column] [type];`;
    }

    createUser(): string {
        return `CREATE USER [name] PASSWORD = 'password';`;
    }

    updateColumn(table: string, column: string, type: string, comment: string, _nullable: string): string {
        const commentSql = comment ? ` COMMENT '${this.quoteLiteral(comment)}'` : "";
        return `ALTER TABLE ${table} ALTER COLUMN ${this.quoteIdentifier(column)} SET DATA TYPE ${type};
ALTER TABLE ${table} RENAME COLUMN ${this.quoteIdentifier(column)} TO [newColumnName]${commentSql};`;
    }

    addColumnSql(addColumnParam: AddColumnParam): string {
        const { columnName, columnType, comment, nullable, table, defaultValue } = addColumnParam;
        const notNull = nullable === false ? " NOT NULL" : "";
        const defaultSql = this.defaultSql(defaultValue);
        const commentSql = comment ? ` COMMENT '${this.quoteLiteral(comment)}'` : "";
        return `ALTER TABLE ${table} ADD COLUMN ${this.quoteIdentifier(columnName)} ${columnType}${defaultSql}${notNull}${commentSql};`;
    }

    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        const { columnName, columnType, newColumnName, comment, nullable, table, defaultValue } = updateColumnParam;
        let sql = `ALTER TABLE ${table} ALTER COLUMN ${this.quoteIdentifier(columnName)} SET DATA TYPE ${columnType};`;
        sql += nullable === false
            ? `ALTER TABLE ${table} ALTER COLUMN ${this.quoteIdentifier(columnName)} SET NOT NULL;`
            : `ALTER TABLE ${table} ALTER COLUMN ${this.quoteIdentifier(columnName)} DROP NOT NULL;`;
        const defaultSql = this.defaultSql(defaultValue).trim();
        if (defaultSql) {
            sql += `ALTER TABLE ${table} ALTER COLUMN ${this.quoteIdentifier(columnName)} SET ${defaultSql};`;
        }
        if (comment) {
            sql += `COMMENT ON COLUMN ${table}.${this.quoteIdentifier(columnName)} IS '${this.quoteLiteral(comment)}';`;
        }
        if (newColumnName && newColumnName != columnName) {
            sql += `ALTER TABLE ${table} RENAME COLUMN ${this.quoteIdentifier(columnName)} TO ${this.quoteIdentifier(newColumnName)};`;
        }
        return sql;
    }

    showUsers(): string {
        return `SHOW USERS`;
    }

    pingDataBase(database: string): string {
        if (!database) {
            return "SELECT 1";
        }
        return `USE SCHEMA ${this.quoteIdentifier(database)};`;
    }

    updateTable(update: UpdateTableParam): string {
        const { table, newTableName, comment, newComment } = update;
        let sql = "";
        if (newComment && newComment != comment) {
            sql += `COMMENT ON TABLE ${table} IS '${this.quoteLiteral(newComment)}';`;
        }
        if (newTableName && table != newTableName) {
            sql += `ALTER TABLE ${table} RENAME TO ${this.quoteIdentifier(newTableName)};`;
        }
        return sql;
    }

    truncateDatabase(database: string): string {
        return `SELECT 'TRUNCATE TABLE "' || TABLE_SCHEMA || '"."' || TABLE_NAME || '";' trun
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '${this.quoteLiteral(database)}' AND TABLE_TYPE = 'BASE TABLE';`;
    }

    createDatabase(database: string): string {
        return `CREATE DATABASE ${this.quoteIdentifier(database)}`;
    }

    showTableSource(database: string, table: string): string {
        return `SELECT GET_DDL('TABLE', '${this.objectName(database, table)}') "Create Table";`;
    }

    showViewSource(database: string, table: string): string {
        return `SELECT GET_DDL('VIEW', '${this.objectName(database, table)}') "Create View";`;
    }

    showProcedureSource(database: string, name: string): string {
        return `SELECT GET_DDL('PROCEDURE', '${this.objectName(database, name)}') "Create Procedure";`;
    }

    showFunctionSource(database: string, name: string): string {
        return `SELECT GET_DDL('FUNCTION', '${this.objectName(database, name)}') "Create Function";`;
    }

    showTriggerSource(_database: string, _name: string): string {
        return "";
    }

    showColumns(database: string, table: string): string {
        const tableName = this.tableName(table);
        return `SELECT COLUMN_NAME "name", DATA_TYPE "simpleType", DATA_TYPE "type", IS_NULLABLE nullable,
CHARACTER_MAXIMUM_LENGTH "maxLength", COLUMN_DEFAULT "defaultValue", COMMENT "comment", '' "key"
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = '${this.quoteLiteral(database)}' AND TABLE_NAME = '${this.quoteLiteral(tableName)}'
ORDER BY ORDINAL_POSITION;`;
    }

    showTriggers(_database: string): string {
        return "";
    }

    showProcedures(database: string): string {
        return `SELECT PROCEDURE_NAME "ROUTINE_NAME"
FROM INFORMATION_SCHEMA.PROCEDURES
WHERE PROCEDURE_SCHEMA = '${this.quoteLiteral(database)}'
ORDER BY PROCEDURE_NAME;`;
    }

    showFunctions(database: string): string {
        return `SELECT FUNCTION_NAME "ROUTINE_NAME"
FROM INFORMATION_SCHEMA.FUNCTIONS
WHERE FUNCTION_SCHEMA = '${this.quoteLiteral(database)}'
ORDER BY FUNCTION_NAME;`;
    }

    showViews(database: string): string {
        return `SELECT TABLE_NAME "name"
FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_SCHEMA = '${this.quoteLiteral(database)}'
ORDER BY TABLE_NAME;`;
    }

    buildPageSql(_database: string, table: string, pageSize: number): string {
        return `SELECT * FROM ${table} LIMIT ${pageSize};`;
    }

    countSql(_database: string, table: string): string {
        return `SELECT COUNT(*) FROM ${table};`;
    }

    showTables(database: string): string {
        return `SELECT TABLE_NAME "name", COMMENT "comment"
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '${this.quoteLiteral(database)}' AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;`;
    }

    showDatabases(): string {
        return `SELECT DATABASE_NAME "Database"
FROM INFORMATION_SCHEMA.DATABASES
ORDER BY DATABASE_NAME;`;
    }

    showSchemas(): string {
        return `SELECT CATALOG_NAME "Database", SCHEMA_NAME "schema"
FROM INFORMATION_SCHEMA.SCHEMATA
WHERE SCHEMA_NAME <> 'INFORMATION_SCHEMA'
ORDER BY CATALOG_NAME, SCHEMA_NAME;`;
    }

    tableTemplate(): string {
        return `CREATE OR REPLACE TABLE [name](
    id NUMBER AUTOINCREMENT START 1 INCREMENT 1,
    create_time TIMESTAMP_NTZ,
    update_time TIMESTAMP_NTZ,
    [column] VARCHAR(255)
);`;
    }

    viewTemplate(): string {
        return `CREATE OR REPLACE VIEW [name]
AS
SELECT * FROM ...;`;
    }

    procedureTemplate(): string {
        return `CREATE OR REPLACE PROCEDURE [name]()
RETURNS STRING
LANGUAGE SQL
AS
$$
BEGIN
    [content]
    RETURN 'ok';
END;
$$;`;
    }

    triggerTemplate(): string {
        return "";
    }

    functionTemplate(): string {
        return `CREATE OR REPLACE FUNCTION [name]()
RETURNS [type]
LANGUAGE SQL
AS
$$
    [value]::[type]
$$;`;
    }

    private defaultSql(defaultValue: string): string {
        if (!defaultValue || defaultValue == "null") {
            return "";
        }
        if (defaultValue == "''" || defaultValue == "CURRENT_TIMESTAMP") {
            return ` DEFAULT ${defaultValue}`;
        }
        return ` DEFAULT '${this.quoteLiteral(defaultValue)}'`;
    }

    private objectName(schema: string, object: string): string {
        return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(this.tableName(object))}`;
    }

    private tableName(table: string): string {
        return table.split(".")[1] || table;
    }

    private quoteIdentifier(value: string): string {
        return `"${String(value || "").replace(/"/g, '""')}"`;
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }
}
