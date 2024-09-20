export interface AddColumnParam {
    table: string;
    comment: string;
    columnName: string;
    columnType: string;
    nullable: boolean;
    defaultValue: any;
}