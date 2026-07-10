import { OracleDialect } from "./oracleDialect";

export class DamengDialect extends OracleDialect {
    private normalizeDamengIdentifier(identifier: string): string {
        const value = String(identifier || "").trim();
        if (value.startsWith("\"") && value.endsWith("\"")) {
            return value.slice(1, -1).replace(/""/g, "\"");
        }
        return value.toUpperCase();
    }

    private quoteDamengLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }

    private damengOwner(schema: string): string {
        return this.quoteDamengLiteral(this.normalizeDamengIdentifier(schema));
    }

    private damengObjectName(name: string): string {
        const parts = String(name || "").split(".");
        return this.quoteDamengLiteral(this.normalizeDamengIdentifier(parts[parts.length - 1]));
    }

    showSchemas(): string {
        return `SELECT USERNAME "schema"
FROM ALL_USERS
WHERE USERNAME NOT IN ('SYS', 'SYSDBA', 'SYSAUDITOR', 'SYSSSO', 'CTISYS')
ORDER BY USERNAME`;
    }

    showDatabases(): string {
        return this.showSchemas();
    }

    showTables(database: string): string {
        const owner = this.damengOwner(database);
        return `SELECT t.TABLE_NAME "name", NVL(c.COMMENTS, '') "comment"
FROM ALL_TABLES t
LEFT JOIN ALL_TAB_COMMENTS c
  ON c.OWNER = t.OWNER AND c.TABLE_NAME = t.TABLE_NAME
WHERE t.OWNER = '${owner}'
ORDER BY t.TABLE_NAME`;
    }

    showViews(database: string): string {
        const owner = this.damengOwner(database);
        return `SELECT VIEW_NAME "name"
FROM ALL_VIEWS
WHERE OWNER = '${owner}'
ORDER BY VIEW_NAME`;
    }

    showColumns(database: string, table: string): string {
        const owner = this.damengOwner(database);
        const tableName = this.damengObjectName(table);
        return `SELECT c.COLUMN_NAME "name",
       c.DATA_TYPE "simpleType",
       CASE
         WHEN c.DATA_TYPE IN ('CHAR', 'NCHAR', 'VARCHAR', 'VARCHAR2', 'NVARCHAR2') THEN c.DATA_TYPE || '(' || c.CHAR_LENGTH || ')'
         WHEN c.DATA_TYPE IN ('NUMBER', 'DECIMAL') AND c.DATA_PRECISION IS NOT NULL AND c.DATA_SCALE IS NOT NULL THEN c.DATA_TYPE || '(' || c.DATA_PRECISION || ',' || c.DATA_SCALE || ')'
         WHEN c.DATA_TYPE IN ('NUMBER', 'DECIMAL') AND c.DATA_PRECISION IS NOT NULL THEN c.DATA_TYPE || '(' || c.DATA_PRECISION || ')'
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

    showProcedures(database: string): string {
        const owner = this.damengOwner(database);
        return `SELECT OBJECT_NAME "ROUTINE_NAME"
FROM ALL_OBJECTS
WHERE OWNER = '${owner}' AND OBJECT_TYPE = 'PROCEDURE'
ORDER BY OBJECT_NAME`;
    }

    showFunctions(database: string): string {
        const owner = this.damengOwner(database);
        return `SELECT OBJECT_NAME "ROUTINE_NAME"
FROM ALL_OBJECTS
WHERE OWNER = '${owner}' AND OBJECT_TYPE = 'FUNCTION'
ORDER BY OBJECT_NAME`;
    }

    showTriggers(database: string): string {
        const owner = this.damengOwner(database);
        return `SELECT TRIGGER_NAME "TRIGGER_NAME"
FROM ALL_TRIGGERS
WHERE OWNER = '${owner}'
ORDER BY TRIGGER_NAME`;
    }

    showTableSource(database: string, table: string): string {
        return this.sourceByMetadata("TABLE", database, table, "Create Table");
    }

    showViewSource(database: string, table: string): string {
        return this.sourceByMetadata("VIEW", database, table, "Create View");
    }

    showProcedureSource(database: string, name: string): string {
        return this.sourceByMetadata("PROCEDURE", database, name, "Create Procedure");
    }

    showFunctionSource(database: string, name: string): string {
        return this.sourceByMetadata("FUNCTION", database, name, "Create Function");
    }

    showTriggerSource(database: string, name: string): string {
        return this.sourceByMetadata("TRIGGER", database, name, "SQL Original Statement");
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    id BIGINT IDENTITY(1, 1) PRIMARY KEY,
    create_time TIMESTAMP,
    update_time TIMESTAMP,
    [column] VARCHAR(255)
);
COMMENT ON TABLE [name] IS '[comment]';
COMMENT ON COLUMN [name].[column] IS '[comment]';`;
    }

    procedureTemplate(): string {
        return `CREATE OR REPLACE PROCEDURE [name]
AS
BEGIN
    NULL;
END;
/`;
    }

    functionTemplate(): string {
        return `CREATE OR REPLACE FUNCTION [name]
RETURN [type]
AS
BEGIN
    RETURN [value];
END;
/`;
    }

    triggerTemplate(): string {
        return `CREATE OR REPLACE TRIGGER [name]
[BEFORE/AFTER] [INSERT/UPDATE/DELETE]
ON [table]
FOR EACH ROW
BEGIN
    NULL;
END;
/`;
    }

    pingDataBase(database: string): string {
        if (!database) {
            return "SELECT 1";
        }
        return `SET SCHEMA ${this.normalizeDamengIdentifier(database)}`;
    }

    private sourceByMetadata(objectType: string, schema: string, name: string, alias: string): string {
        const owner = this.damengOwner(schema);
        const objectName = this.damengObjectName(name);
        return `SELECT DBMS_METADATA.GET_DDL('${objectType}', '${objectName}', '${owner}') "${alias}",
       DBMS_METADATA.GET_DDL('${objectType}', '${objectName}', '${owner}') "CREATE_SQL"
FROM DUAL`;
    }
}
