import { MysqlDialect } from "./mysqlDialect";

export class DorisDialect extends MysqlDialect {
    createDatabase(database: string): string {
        return `CREATE DATABASE ${this.quoteIdentifier(database)}`;
    }

    showTables(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT TABLE_COMMENT \`comment\`, TABLE_NAME as \`name\`, TABLE_ROWS \`rows\`, NULL auto_increment, NULL \`row_format\`, DATA_LENGTH data_length, INDEX_LENGTH index_length
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = '${schema}' AND TABLE_TYPE <> 'VIEW'
ORDER BY TABLE_NAME;`;
    }

    showViews(database: string): string {
        const schema = this.quoteLiteral(database);
        return `SELECT TABLE_NAME name
FROM information_schema.VIEWS
WHERE TABLE_SCHEMA = '${schema}'
ORDER BY TABLE_NAME;`;
    }

    showColumns(database: string, table: string): string {
        const schema = this.quoteLiteral(database);
        const tableName = this.quoteLiteral(table);
        return `SELECT COLUMN_NAME name, DATA_TYPE simpleType, DATA_TYPE type, COLUMN_COMMENT comment, COLUMN_KEY \`key\`, IS_NULLABLE nullable, CHARACTER_MAXIMUM_LENGTH maxLength, COLUMN_DEFAULT defaultValue, EXTRA extra
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${tableName}'
ORDER BY ORDINAL_POSITION;`;
    }

    tableTemplate(): string {
        return `CREATE TABLE [name] (
    id BIGINT NOT NULL COMMENT 'primary key',
    create_time DATETIME COMMENT 'create time',
    update_time DATETIME COMMENT 'update time',
    [column] VARCHAR(255) COMMENT ''
)
ENGINE=OLAP
DUPLICATE KEY(id)
DISTRIBUTED BY HASH(id) BUCKETS 10
PROPERTIES (
    "replication_allocation" = "tag.location.default: 1"
);`;
    }

    private quoteIdentifier(identifier: string): string {
        return `\`${String(identifier || "").replace(/`/g, "``")}\``;
    }

    private quoteLiteral(value: string): string {
        return String(value || "").replace(/'/g, "''");
    }
}
