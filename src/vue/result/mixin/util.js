import { quoteLiteral } from "@/common/sqlValue";

export const util = {
    methods: {
        /**
         * Escapes a value for inlining into SQL.
         *
         * Thin wrapper over the shared implementation so the filter and DELETE paths
         * escape identically to the edit path. The previous local version returned any
         * value containing parentheses verbatim -- so a cell holding `(1) , price=0`
         * rewrote a column the user never edited -- escaped only single quotes, and
         * did so with a backslash, which is not an escape on PostgreSQL, SQL Server or
         * Oracle.
         */
        wrapQuote(type, value) {
            // EditDialog carries dbType directly; App.vue has it on result.
            const databaseType = this.dbType || (this.result && this.result.dbType);
            return quoteLiteral(type, value, databaseType);
        }
    }
}
