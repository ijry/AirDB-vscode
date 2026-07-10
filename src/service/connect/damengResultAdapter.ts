import { FieldInfo } from "@/common/typeDef";

export interface DamengExecuteResult {
    rows?: any[];
    metaData?: DamengColumnMetadata[];
    rowsAffected?: number;
}

export interface DamengColumnMetadata {
    name?: string;
    columnName?: string;
    dbTypeName?: string;
    precision?: number;
    scale?: number;
    nullable?: boolean;
}

export interface AdaptedDamengResult {
    results: any;
    fields: FieldInfo[];
}

export function adaptDamengResult(result: DamengExecuteResult): AdaptedDamengResult {
    if (Array.isArray(result.rows) || Array.isArray(result.metaData)) {
        return {
            results: result.rows || [],
            fields: adaptDamengFields(result.metaData || []),
        };
    }

    return {
        results: { affectedRows: result.rowsAffected || 0 },
        fields: [],
    };
}

export function adaptDamengFields(metaData: DamengColumnMetadata[]): FieldInfo[] {
    return metaData.map((column) => {
        const name = column.name || column.columnName || "";
        return {
            catalog: "",
            db: "",
            schema: "",
            table: "",
            orgTable: "",
            name,
            orgName: name,
            charsetNr: 0,
            length: column.precision || 0,
            flags: 0,
            decimals: column.scale || 0,
            zeroFill: false,
            protocol41: false,
            type: 0 as any,
        };
    });
}
