export type SqlScriptMode = "default" | "kingbase" | "dameng";

export function parseSqlScriptBatches(sql: string, mode: SqlScriptMode = "default"): string[] {
    const batches: string[] = [];
    let current = "";
    let quote: "'" | "\"" | null = null;
    let dollarQuote: string | null = null;
    let lineComment = false;
    let blockComment = false;

    const push = () => {
        const statement = current.trim();
        if (statement) {
            batches.push(statement);
        }
        current = "";
    };

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];
        const next = sql[i + 1];

        if (lineComment) {
            current += char;
            if (char === "\n") {
                lineComment = false;
            }
            continue;
        }

        if (blockComment) {
            current += char;
            if (char === "*" && next === "/") {
                current += next;
                i++;
                blockComment = false;
            }
            continue;
        }

        if (quote) {
            current += char;
            if (char === quote) {
                if (next === quote) {
                    current += next;
                    i++;
                } else {
                    quote = null;
                }
            }
            continue;
        }

        if (dollarQuote) {
            if (sql.startsWith(dollarQuote, i)) {
                current += dollarQuote;
                i += dollarQuote.length - 1;
                dollarQuote = null;
            } else {
                current += char;
            }
            continue;
        }

        if (char === "-" && next === "-") {
            current += char + next;
            i++;
            lineComment = true;
            continue;
        }

        if (char === "/" && next === "*") {
            current += char + next;
            i++;
            blockComment = true;
            continue;
        }

        if (char === "'" || char === "\"") {
            quote = char;
            current += char;
            continue;
        }

        if (mode === "kingbase" && char === "$") {
            const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
            if (match) {
                dollarQuote = match[0];
                current += dollarQuote;
                i += dollarQuote.length - 1;
                continue;
            }
        }

        if (mode === "dameng" && char === "/" && isSlashTerminator(sql, i)) {
            push();
            continue;
        }

        if (char === ";") {
            if (mode === "dameng" && isDamengRoutine(current)) {
                current += char;
                continue;
            }
            push();
            continue;
        }

        current += char;
    }

    push();
    return batches;
}

function isSlashTerminator(sql: string, index: number): boolean {
    const beforeLineStart = sql.lastIndexOf("\n", index - 1) + 1;
    const afterLineEndIndex = sql.indexOf("\n", index + 1);
    const afterLineEnd = afterLineEndIndex === -1 ? sql.length : afterLineEndIndex;
    const line = sql.slice(beforeLineStart, afterLineEnd).trim();
    return line === "/";
}

function isDamengRoutine(sql: string): boolean {
    return /^\s*CREATE\s+(OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION|TRIGGER)\b/i.test(sql);
}
