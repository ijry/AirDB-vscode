import { AbstractPageSerivce } from "./pageService";

export class OraclePageService extends AbstractPageSerivce {
    protected buildPageSql(sql: string, start: number, limit: number): string {
        const normalized = sql.trim().replace(/;+\s*$/, "");
        const paginationSql = `OFFSET ${start} ROWS FETCH NEXT ${limit} ROWS ONLY`;
        const pagePattern = this.pageMatch();

        if (pagePattern.test(normalized)) {
            return normalized.replace(pagePattern, paginationSql);
        }

        return `${normalized} ${paginationSql}`;
    }

    protected pageMatch() {
        return /\boffset\s+\d+\s+rows\s+fetch\s+next\s+(\d+)\s+rows\s+only\b/i;
    }
}
