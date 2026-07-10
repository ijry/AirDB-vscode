import * as sqlstring from "sqlstring";

export interface SqlScriptDumpProfile {
    name: "kingbase" | "dameng";
    quote(identifier: string): string;
    qualify(schema: string, objectName: string): string;
    dropTable(schema: string, table: string): string;
    dropView(schema: string, view: string): string;
    routineTerminator: ";" | "\n/";
}

export function createKingbaseDumpProfile(): SqlScriptDumpProfile {
    return createDoubleQuoteProfile("kingbase", ";");
}

export function createDamengDumpProfile(): SqlScriptDumpProfile {
    return createDoubleQuoteProfile("dameng", "\n/");
}

export function buildInsertStatement(profile: SqlScriptDumpProfile, schema: string, table: string, rows: any[]): string {
    if (!rows.length) {
        return "";
    }
    const columns = Object.keys(rows[0]);
    const columnSql = columns.map((column) => profile.quote(column)).join(",");
    const valuesSql = rows
        .map((row) => `(${columns.map((column) => escapeValue(row[column])).join(",")})`)
        .join(",");
    return `INSERT INTO ${profile.qualify(schema, table)} (${columnSql}) VALUES ${valuesSql};`;
}

export function appendRoutineTerminator(profile: SqlScriptDumpProfile, sql: string): string {
    let trimmed = String(sql || "").trim();
    if (!trimmed) {
        return "";
    }
    if (profile.routineTerminator === "\n/") {
        trimmed = trimmed.replace(/\n\/\s*$/, "").trim();
        return `${trimmed}${profile.routineTerminator}`;
    }
    trimmed = trimmed.replace(/;+\s*$/, "");
    return `${trimmed}${profile.routineTerminator}`;
}

function createDoubleQuoteProfile(name: "kingbase" | "dameng", routineTerminator: ";" | "\n/"): SqlScriptDumpProfile {
    const quote = (identifier: string) => `"${String(identifier || "").replace(/"/g, "\"\"")}"`;
    return {
        name,
        quote,
        qualify(schema: string, objectName: string): string {
            return `${quote(schema)}.${quote(objectName)}`;
        },
        dropTable(schema: string, table: string): string {
            return `DROP TABLE IF EXISTS ${this.qualify(schema, table)};`;
        },
        dropView(schema: string, view: string): string {
            return `DROP VIEW IF EXISTS ${this.qualify(schema, view)};`;
        },
        routineTerminator,
    };
}

function escapeValue(value: any): string {
    if (value === null || typeof value === "undefined") {
        return "NULL";
    }
    if (value instanceof Date) {
        return sqlstring.escape(value);
    }
    return sqlstring.escape(value);
}
