import { AddColumnParam } from "./param/addColumnParam";
import { CreateIndexParam } from "./param/createIndexParam";
import { UpdateColumnParam } from "./param/updateColumnParam";
import { UpdateTableParam } from "./param/updateTableParam";
import { SqlDialect } from "./sqlDialect";

export class OracleDialect extends SqlDialect {
    private normalizeIdentifier(identifier: string): string {
        const value = String(identifier || "").trim();
        if (value.startsWith("\"") && value.endsWith("\"")) {
            return value.slice(1, -1).replace(/""/g, "\"");
        }
        return value.toUpperCase();
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }

    private owner(database: string): string {
        return this.quoteLiteral(this.normalizeIdentifier(database));
    }

    private objectName(table: string): string {
        const parts = String(table || "").split(".");
        const raw = parts[parts.length - 1];
        return this.quoteLiteral(this.normalizeIdentifier(raw));
    }

    private qualified(database: string, table: string): string {
        return `${database}.${table}`;
    }

    showSchemas(): string {
        return `SELECT DISTINCT OWNER "schema"
FROM ALL_OBJECTS
WHERE OWNER NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'APPQOSSYS', 'XDB', 'CTXSYS', 'MDSYS', 'ORDSYS')
ORDER BY OWNER`;
    }

    showDatabases(): string {
        return this.showSchemas();
    }

    showTables(database: string): string {
        const owner = this.owner(database);
        return `SELECT t.TABLE_NAME "name", NVL(c.COMMENTS, '') "comment"
FROM ALL_TABLES t
LEFT JOIN ALL_TAB_COMMENTS c
  ON c.OWNER = t.OWNER AND c.TABLE_NAME = t.TABLE_NAME
WHERE t.OWNER = '${owner}'
ORDER BY t.TABLE_NAME`;
    }

    showViews(database: string): string {
        const owner = this.owner(database);
        return `SELECT VIEW_NAME "name"
FROM ALL_VIEWS
WHERE OWNER = '${owner}'
ORDER BY VIEW_NAME`;
    }

    showColumns(database: string, table: string): string {
        const owner = this.owner(database);
        const tableName = this.objectName(table);
        return `SELECT c.COLUMN_NAME "name",
       c.DATA_TYPE "simpleType",
       CASE
         WHEN c.DATA_TYPE IN ('CHAR', 'NCHAR', 'VARCHAR2', 'NVARCHAR2') THEN c.DATA_TYPE || '(' || c.CHAR_LENGTH || ')'
         WHEN c.DATA_TYPE = 'NUMBER' AND c.DATA_PRECISION IS NOT NULL AND c.DATA_SCALE IS NOT NULL THEN c.DATA_TYPE || '(' || c.DATA_PRECISION || ',' || c.DATA_SCALE || ')'
         WHEN c.DATA_TYPE = 'NUMBER' AND c.DATA_PRECISION IS NOT NULL THEN c.DATA_TYPE || '(' || c.DATA_PRECISION || ')'
         ELSE c.DATA_TYPE
       END "type",
       c.NULLABLE "nullable",
       c.DATA_LENGTH "maxLength",
       c.DATA_DEFAULT "defaultValue",
       NVL(cc.COMMENTS, '') "comment",
       ac.CONSTRAINT_TYPE "key"
FROM ALL_TAB_COLUMNS c
LEFT JOIN ALL_COL_COMMENTS cc
  ON cc.OWNER = c.OWNER AND cc.TABLE_NAME = c.TABLE_NAME AND cc.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN ALL_CONS_COLUMNS acc
  ON acc.OWNER = c.OWNER AND acc.TABLE_NAME = c.TABLE_NAME AND acc.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN ALL_CONSTRAINTS ac
  ON ac.OWNER = acc.OWNER AND ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME AND ac.CONSTRAINT_TYPE = 'P'
WHERE c.OWNER = '${owner}'
  AND c.TABLE_NAME = '${tableName}'
ORDER BY c.COLUMN_ID`;
    }

    buildPageSql(database: string, table: string, pageSize: number): string {
        return `SELECT * FROM ${this.qualified(database, table)} OFFSET 0 ROWS FETCH NEXT ${pageSize} ROWS ONLY`;
    }

    countSql(database: string, table: string): string {
        return `SELECT count(*) "count" FROM ${this.qualified(database, table)}`;
    }

    pingDataBase(database: string): string {
        if (!database) {
            return "SELECT 1 FROM DUAL";
        }
        return `ALTER SESSION SET CURRENT_SCHEMA = ${this.normalizeIdentifier(database)}`;
    }

    showUsers(): string {
        return `SELECT USERNAME "user" FROM ALL_USERS ORDER BY USERNAME`;
    }

    createUser(): string {
        return `CREATE USER [name] IDENTIFIED BY password`;
    }

    createDatabase(database: string): string {
        return `CREATE USER ${this.normalizeIdentifier(database)} IDENTIFIED BY password`;
    }

    truncateDatabase(database: string): string {
        const owner = this.owner(database);
        return `SELECT 'TRUNCATE TABLE "' || OWNER || '"."' || TABLE_NAME || '"' "trun"
FROM ALL_TABLES
WHERE OWNER = '${owner}'`;
    }

    showTriggers(database: string): string {
        const owner = this.owner(database);
        return `SELECT TRIGGER_NAME
FROM ALL_TRIGGERS
WHERE OWNER = '${owner}'
ORDER BY TRIGGER_NAME`;
    }

    showProcedures(database: string): string {
        const owner = this.owner(database);
        return `SELECT OBJECT_NAME ROUTINE_NAME
FROM ALL_OBJECTS
WHERE OWNER = '${owner}' AND OBJECT_TYPE = 'PROCEDURE'
ORDER BY OBJECT_NAME`;
    }

    showFunctions(database: string): string {
        const owner = this.owner(database);
        return `SELECT OBJECT_NAME ROUTINE_NAME
FROM ALL_OBJECTS
WHERE OWNER = '${owner}' AND OBJECT_TYPE = 'FUNCTION'
ORDER BY OBJECT_NAME`;
    }

    showTableSource(database: string, table: string): string {
        const owner = this.owner(database);
        const tableName = this.objectName(table);
        return `SELECT DBMS_METADATA.GET_DDL('TABLE', '${tableName}', '${owner}') "Create Table" FROM DUAL`;
    }

    showViewSource(database: string, table: string): string {
        const owner = this.owner(database);
        const tableName = this.objectName(table);
        return `SELECT DBMS_METADATA.GET_DDL('VIEW', '${tableName}', '${owner}') "Create View" FROM DUAL`;
    }

    showProcedureSource(database: string, name: string): string {
        const owner = this.owner(database);
        const objectName = this.objectName(name);
        return `SELECT DBMS_METADATA.GET_DDL('PROCEDURE', '${objectName}', '${owner}') "Create Procedure" FROM DUAL`;
    }

    showFunctionSource(database: string, name: string): string {
        const owner = this.owner(database);
        const objectName = this.objectName(name);
        return `SELECT DBMS_METADATA.GET_DDL('FUNCTION', '${objectName}', '${owner}') "Create Function" FROM DUAL`;
    }

    showTriggerSource(database: string, name: string): string {
        const owner = this.owner(database);
        const objectName = this.objectName(name);
        return `SELECT DBMS_METADATA.GET_DDL('TRIGGER', '${objectName}', '${owner}') "SQL Original Statement" FROM DUAL`;
    }

    showIndex(database: string, table: string): string {
        const owner = this.owner(database);
        const tableName = this.objectName(table);
        return `SELECT INDEX_NAME "index_name", COLUMN_NAME "column_name", UNIQUENESS "is_unique"
FROM ALL_IND_COLUMNS ic
JOIN ALL_INDEXES i
  ON i.OWNER = ic.INDEX_OWNER AND i.INDEX_NAME = ic.INDEX_NAME
WHERE ic.TABLE_OWNER = '${owner}' AND ic.TABLE_NAME = '${tableName}'
ORDER BY INDEX_NAME, COLUMN_POSITION`;
    }

    createIndex(createIndexParam: CreateIndexParam): string {
        const type = createIndexParam.type || "";
        const unique = type.toLowerCase().includes("unique") ? "UNIQUE " : "";
        const indexName = `${createIndexParam.column}_${new Date().getTime()}_index`;
        return `CREATE ${unique}INDEX ${indexName} ON ${createIndexParam.table} (${createIndexParam.column})`;
    }

    dropIndex(table: string, indexName: string): string {
        return `DROP INDEX ${indexName}`;
    }

    addColumn(table: string): string {
        return `ALTER TABLE ${table} ADD ([column] [type])`;
    }

    addColumnSql(addColumnParam: AddColumnParam): string {
        const { columnName, columnType, comment, nullable, table, defaultValue } = addColumnParam;
        const nullableSql = nullable ? "" : " NOT NULL";
        const defaultSql = defaultValue ? ` DEFAULT ${defaultValue}` : "";
        const commentSql = comment ? `;\nCOMMENT ON COLUMN ${table}.${columnName} IS '${this.quoteLiteral(comment)}'` : "";
        return `ALTER TABLE ${table} ADD (${columnName} ${columnType}${defaultSql}${nullableSql})${commentSql};`;
    }

    updateColumn(table: string, column: string, type: string, comment: string, nullable: string): string {
        const nullableSql = nullable == "YES" ? " NULL" : " NOT NULL";
        const commentSql = comment ? `;\nCOMMENT ON COLUMN ${table}.${column} IS '${this.quoteLiteral(comment)}'` : "";
        return `ALTER TABLE ${table} MODIFY (${column} ${type}${nullableSql})${commentSql};`;
    }

    updateColumnSql(updateColumnParam: UpdateColumnParam): string {
        const { columnName, columnType, newColumnName, comment, nullable, table, defaultValue } = updateColumnParam;
        const nullableSql = nullable ? "" : " NOT NULL";
        const defaultSql = defaultValue ? ` DEFAULT ${defaultValue}` : "";
        let sql = `ALTER TABLE ${table} MODIFY (${columnName} ${columnType}${defaultSql}${nullableSql});`;
        if (newColumnName && newColumnName != columnName) {
            sql += `\nALTER TABLE ${table} RENAME COLUMN ${columnName} TO ${newColumnName};`;
        }
        if (comment) {
            sql += `\nCOMMENT ON COLUMN ${table}.${newColumnName || columnName} IS '${this.quoteLiteral(comment)}';`;
        }
        return sql;
    }

    updateTable(update: UpdateTableParam): string {
        const { table, newTableName, comment, newComment } = update;
        let sql = "";
        if (newTableName && newTableName != table) {
            sql += `ALTER TABLE ${table} RENAME TO ${newTableName};`;
        }
        if (newComment && newComment != comment) {
            sql += `\nCOMMENT ON TABLE ${newTableName || table} IS '${this.quoteLiteral(newComment)}';`;
        }
        return sql;
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    id NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    create_time DATE,
    update_time DATE,
    [column] VARCHAR2(255)
);
COMMENT ON TABLE [name] IS '[comment]';
COMMENT ON COLUMN [name].[column] IS '[comment]';`;
    }

    viewTemplate(): string {
        return `CREATE VIEW [name]
AS
SELECT * FROM ...;`;
    }

    procedureTemplate(): string {
        return `CREATE OR REPLACE PROCEDURE [name]
AS
BEGIN
    NULL;
END;`;
    }

    triggerTemplate(): string {
        return `CREATE OR REPLACE TRIGGER [name]
[BEFORE/AFTER] [INSERT/UPDATE/DELETE]
ON [table]
FOR EACH ROW
BEGIN
    NULL;
END;`;
    }

    functionTemplate(): string {
        return `CREATE OR REPLACE FUNCTION [name]
RETURN [type]
AS
BEGIN
    RETURN [value];
END;`;
    }

    processList(): string {
        return `SELECT SID "Id", SERIAL# "Serial", USERNAME "User", STATUS "State", PROGRAM "Info" FROM V$SESSION ORDER BY SID`;
    }

    variableList(): string {
        return `SELECT NAME, VALUE FROM V$PARAMETER ORDER BY NAME`;
    }

    statusList(): string {
        return `SELECT NAME, VALUE FROM V$SYSSTAT ORDER BY NAME`;
    }
}
