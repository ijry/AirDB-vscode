import { PostgreSqlDialect } from "./postgreSqlDialect";

export class KingbaseDialect extends PostgreSqlDialect {
    showProcedures(database: string): string {
        return `SELECT p.proname "ROUTINE_NAME"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '${database}' AND p.prokind = 'p'
ORDER BY p.proname`;
    }

    showFunctions(database: string): string {
        return `SELECT p.proname "ROUTINE_NAME"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '${database}' AND p.prokind IN ('f','a','w')
ORDER BY p.proname`;
    }

    showProcedureSource(database: string, name: string): string {
        return `SELECT pg_get_functiondef(p.oid) "Create Procedure", p.proname "Procedure", pg_get_functiondef(p.oid) "CREATE_SQL"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '${database}' AND p.proname = '${name}' AND p.prokind = 'p'
ORDER BY p.oid
LIMIT 1`;
    }

    showFunctionSource(database: string, name: string): string {
        return `SELECT pg_get_functiondef(p.oid) "Create Function", p.proname "Function", pg_get_functiondef(p.oid) "CREATE_SQL"
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = '${database}' AND p.proname = '${name}' AND p.prokind IN ('f','a','w')
ORDER BY p.oid
LIMIT 1`;
    }

    showTriggerSource(database: string, name: string): string {
        return `SELECT pg_get_triggerdef(t.oid) "SQL Original Statement", t.tgname "Trigger", pg_get_triggerdef(t.oid) "CREATE_SQL"
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${database}' AND t.tgname = '${name}' AND NOT t.tgisinternal
ORDER BY t.oid
LIMIT 1`;
    }

    procedureTemplate(): string {
        return `CREATE PROCEDURE [name]()
LANGUAGE plpgsql
AS $body$
BEGIN
    [content]
END;
$body$;`;
    }

    functionTemplate(): string {
        return `CREATE FUNCTION [name]()
RETURNS [type]
LANGUAGE plpgsql
AS $body$
BEGIN
    RETURN [value];
END;
$body$;`;
    }

    triggerTemplate(): string {
        return `CREATE FUNCTION [tri_fun]() RETURNS TRIGGER
LANGUAGE plpgsql
AS $body$
BEGIN
    RETURN NEW;
END;
$body$;

CREATE TRIGGER [name]
[BEFORE/AFTER] [INSERT/UPDATE/DELETE]
ON [table]
FOR EACH ROW
EXECUTE FUNCTION [tri_fun]();`;
    }
}
