import { PostgreSqlDialect } from "./postgreSqlDialect";

export class RedshiftDialect extends PostgreSqlDialect {
    showDatabases() {
        return `SELECT datname "Database" FROM pg_database WHERE datistemplate = false ORDER BY datname;`;
    }

    showSchemas(): string {
        return `SELECT catalog_name "Database", schema_name "schema"
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
ORDER BY catalog_name, schema_name;`;
    }

    showTables(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT table_name "name", '' "comment"
FROM information_schema.tables
WHERE table_schema = '${schema}' AND table_type = 'BASE TABLE'
ORDER BY table_name;`;
    }

    showViews(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT table_name "name"
FROM information_schema.views
WHERE table_schema = '${schema}'
ORDER BY table_name;`;
    }

    showColumns(database: string, table: string): string {
        const schema = this.quoteLiteral(database);
        const tableName = this.quoteLiteral(table.split('.')[1] || table);
        return `SELECT column_name "name", data_type "simpleType", data_type "type", is_nullable nullable,
character_maximum_length "maxLength", column_default "defaultValue", '' "comment", '' "key"
FROM information_schema.columns
WHERE table_schema = '${schema}' AND table_name = '${tableName}'
ORDER BY ordinal_position;`;
    }

    showTableSource(_database: string, _table: string): string {
        return "";
    }

    tableTemplate(): string {
        return `CREATE TABLE [name](
    id BIGINT IDENTITY(1,1) NOT NULL,
    create_time TIMESTAMP,
    update_time TIMESTAMP,
    [column] VARCHAR(255)
)
DISTSTYLE AUTO
SORTKEY(create_time);`;
    }

    procedureTemplate(): string {
        return `CREATE PROCEDURE [name]()
LANGUAGE plpgsql
AS $$
BEGIN
    [content]
END;
$$;`;
    }

    functionTemplate(): string {
        return `CREATE FUNCTION [name]()
RETURNS [type]
STABLE
AS $$
    SELECT [value]::[type];
$$ LANGUAGE SQL;`;
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }
}
