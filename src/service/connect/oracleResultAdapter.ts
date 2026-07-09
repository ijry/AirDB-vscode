import { FieldInfo } from "@/common/typeDef";

export interface OracleExecuteResult {
    rows?: any[];
    metaData?: OracleColumnMetadata[];
    rowsAffected?: number;
}

export interface OracleColumnMetadata {
    name: string;
    dbTypeName?: string;
    byteSize?: number;
    nullable?: boolean;
}

export interface AdaptedOracleResult {
    results: any;
    fields: FieldInfo[];
}

export function adaptOracleResult(result: OracleExecuteResult): AdaptedOracleResult {
    if (Array.isArray(result.rows) || Array.isArray(result.metaData)) {
        return {
            results: result.rows || [],
            fields: adaptOracleFields(result.metaData || []),
        };
    }

    return {
        results: { affectedRows: result.rowsAffected || 0 },
        fields: [],
    };
}

export function adaptOracleFields(metaData: OracleColumnMetadata[]): FieldInfo[] {
    return metaData.map((column) => ({
        catalog: "",
        db: "",
        schema: "",
        table: "",
        orgTable: "",
        name: column.name,
        orgName: column.name,
        charsetNr: 0,
        length: column.byteSize || 0,
        flags: 0,
        decimals: 0,
        zeroFill: false,
        protocol41: false,
        type: 0 as any,
    }));
}
