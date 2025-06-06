import { ColumnMeta, TableMeta } from "@/common/typeDef";
import { Hanlder, ViewManager } from "@/common/viewManager";
import * as vscode from "vscode";
import { ConfigKey, DatabaseType, ModelType, Template } from "../../common/constants";
import { Global } from "../../common/global";
import { Util } from "../../common/util";
import { DbTreeDataProvider } from "../../provider/treeDataProvider";
import { ConnectionManager } from "../../service/connectionManager";
import { MockRunner } from "../../service/mock/mockRunner";
import { QueryUnit } from "../../service/queryUnit";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { ColumnNode } from "../other/columnNode";
import { InfoNode } from "../other/infoNode";
import { TableGroup } from "./tableGroup";
import { Console } from "@/common/Console";

export class TableNode extends Node implements CopyAble {

    public iconPath = new vscode.ThemeIcon("split-horizontal")
    public contextValue: string = ModelType.TABLE;
    public table: string;
    public pined: boolean = false;

    constructor(readonly meta: TableMeta, readonly parent: TableGroup) {
        super(`${meta.name}`)
        this.table = meta.name
        this.pined = meta.pined
        if (!this.pined) {
            this.iconPath=new vscode.ThemeIcon("split-horizontal");
        } else {
            this.iconPath=new vscode.ThemeIcon("pinned");
        }
        this.description = `${meta.comment || ''} ${(meta.rows != null) ? `Rows ${meta.rows}` : ''}`
        if (Util.supportColorIcon) {
            // this.iconPath=new vscode.ThemeIcon("split-horizontal",new vscode.ThemeColor("problemsWarningIcon.foreground"))
        }
        if (parent != null) {
            // parent.pinedTablesMap = null; // 防止向子级传递导致多余的内存占用
        }
        this.init(parent)
        this.tooltip = this.getToolTipe(meta)
        this.cacheSelf()
        // 默认点击事件
        this.command = {
            command: "airdb.table.find",
            title: vscode.l10n.t("Run Select Statement"),
            arguments: [this, true],
        }

        // 上下文关键字，这会决定表上按钮的选项显隐。
        // vscode.commands.executeCommand('setContext', 'table.pined', this.pined);
    }

    // 表置顶
    public async pin(table: TableNode) {
        // if (this.isCloud) {
            // this.pined = !this.pined;
            if (this.pined) {
                this.parent?.unpinTable(this.table);
            } else {
                this.parent?.pinTable(this.table);
            }
        // }
    }

    // 表取消置顶
    public async unpin(table: TableNode) {
        // if (this.isCloud) {
            this.pined = false;
            this.parent.unpinTable(this.table);
        // }
    }

    public async getChildren(isRresh: boolean = false): Promise<Node[]> {
        let columnNodes = this.getChildCache();
        if (columnNodes && !isRresh) {
            return columnNodes;
        }
        return this.execute<ColumnMeta[]>(this.dialect.showColumns(this.schema, this.table))
            .then((columns) => {
                columnNodes = columns.map<ColumnNode>((column, index) => {
                    return new ColumnNode(this.table, column, this, index);
                });
                this.setChildCache(columnNodes)
                return columnNodes;
            })
            .catch((err) => {
                return [new InfoNode(err)];
            });
    }

    public addColumnTemplate() {
        QueryUnit.showSQLTextDocument(this, this.dialect.addColumn(this.wrap(this.table)), Template.alter);
    }


    public async showSource(open = true) {
        let sql: string;
        if (this.dbType == DatabaseType.MYSQL || this.dbType == DatabaseType.SQLITE) {
            const sourceResule = await this.execute<any[]>(this.dialect.showTableSource(this.schema, this.table))
            sql = sourceResule[0]['Create Table'];
            if (this.dbType == DatabaseType.SQLITE) {
                sql = sql.replace(/\\n/g, '\n');
            }
        } else {
            const childs = await this.getChildren();
            sql = `CREATE TABLE ${this.table}(\n`
            for (let i = 0; i < childs.length; i++) {
                const child: ColumnNode = childs[i] as ColumnNode;
                if (i == childs.length - 1) {
                    sql += `    ${child.column.name} ${child.type}${child.isPrimaryKey ? ' PRIMARY KEY' : ''}\n`
                } else {
                    sql += `    ${child.column.name} ${child.type}${child.isPrimaryKey ? ' PRIMARY KEY' : ''},\n`
                }
            }
            sql += ")"
        }
        if (open) {
            QueryUnit.showSQLTextDocument(this, sql);
        }
        return sql;
    }

    public dropTable() {

        Util.confirm(vscode.l10n.t(`Are you sure you want to drop table {0} ? `, this.table), async () => {
            this.execute(`DROP TABLE ${this.wrap(this.table)}`).then(() => {
                this.parent.setChildCache(null)
                DbTreeDataProvider.refresh(this.parent);
                vscode.window.showInformationMessage(`Drop table ${this.table} success!`);
            });
        })

    }


    public truncateTable() {

        Util.confirm(vscode.l10n.t(`Are you sure you want to clear table {0} all data ?`, this.table), async () => {
            const truncateSql = this.dbType == DatabaseType.SQLITE ? `DELETE FROM ${this.wrap(this.table)}` : `truncate table ${this.wrap(this.table)}`;
            this.execute(truncateSql).then(() => {
                vscode.window.showInformationMessage(vscode.l10n.t(`Clear table {0} all data success!`, this.table));
            });
        })

    }



    public designTable() {

        const executeAndRefresh = async (sql: string, handler: Hanlder) => {
            try {
                await this.execute(sql)
                handler.emit("success")
            } catch (error) {
                handler.emit("error", vscode.l10n.t(error.message))
            }
        }
        let type = this.key + this.schema + '-design-' + this.table;
        // Console.log(type)
        ViewManager.createWebviewPanel({
            path: "app", title: vscode.l10n.t("Design Table") + this.table, type,
            splitView: false, iconPath: Global.getExtPath("resources", "icon", "dropper.svg"),
            eventHandler: (handler => {
                handler.on("init", () => {
                    handler.emit('route', 'design')
                }).on("route-design", async () => {
                    const result = await this.execute(this.dialect.showIndex(this.schema, this.table))
                    let primaryKey: string;
                    const columnList = (await this.getChildren()).map((columnNode: ColumnNode) => {
                        if (columnNode.isPrimaryKey) {
                            primaryKey = columnNode.column.name;
                        }
                        columnNode.column.newColumnName = columnNode.column.name;
                        columnNode.column.editState = 0; // 0是默认状态
                        return columnNode.column;
                    });
                    handler.emit('design-data', { indexs: result, table: this.table, comment: this.meta.comment, columnList, primaryKey, dbType: this.dbType })
                }).on("updateTable", async ({ newTableName, newComment }) => {
                    const sql = this.dialect.updateTable({ table: this.table, newTableName, comment: this.meta.comment, newComment });
                    await executeAndRefresh(sql, handler)
                    this.parent.setChildCache(null)
                    // 下面两行缺失会导致设计表页面修改后页面还是老数据
                    this.table = newTableName;
                    this.meta.comment = newComment;
                    this.provider.reload(this.parent)
                }).on("addColumnSql", async (addColumnParam) => {
                    const sql = this.dialect.addColumnSql(addColumnParam);
                    await executeAndRefresh(sql, handler)
                    this.setChildCache(null)
                    this.provider.reload(this.parent)
                }).on("updateColumnSql", async (updateColumnParam) => {
                    const sql = this.dialect.updateColumnSql(updateColumnParam);
                    await executeAndRefresh(sql, handler)
                    this.setChildCache(null)
                    this.provider.reload(this.parent)
                }).on("dropIndex", async indexName => {
                    const sql = this.dialect.dropIndex(this.table, indexName);
                    await executeAndRefresh(sql, handler)
                }).on("execute", async sql => {
                    await executeAndRefresh(sql, handler)
                    this.setChildCache(null)
                    this.parent.setChildCache(null)
                    this.provider.reload(this.parent)
                }).on("createIndex", async ({ column, type, indexType }) => {
                    const sql = this.dialect.createIndex({ column, type, indexType, table: this.wrap(this.table) });
                    await executeAndRefresh(sql, handler)
                }).on("saveDesign", async (changeList) => {
                    // 批量执行设计表时的字段变动SQL
                    let sql = '';
                    // @ts-ignore
                    changeList.forEach(element => {
                        switch (element.actionType) {
                            case 'addColumnSql':
                                // @ts-ignore
                                sql = sql + this.dialect.addColumnSql(element);
                                break;
                            case 'updateColumnSql':
                                // @ts-ignore
                                sql = sql + this.dialect.updateColumnSql(element);
                                break;
                            case 'execute':
                                sql = sql + element.sql;
                                break;
                            default:
                                break;
                        }
                    });
                    await executeAndRefresh(sql, handler)
                    this.setChildCache(null)
                    this.provider.reload(this.parent)
                })
            })
        })

    }

    // 在新标签页打开表
    public async openInNew() {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.schema), this.wrap(this.table), pageSize);
        QueryUnit.runQuery(sql, this, { viewId: new Date().getTime() });
        ConnectionManager.changeActive(this)
    }

    // 在同一标签页打开表
    public async openTable() {
        const pageSize = Global.getConfig<number>(ConfigKey.DEFAULT_LIMIT);
        const sql = this.dialect.buildPageSql(this.wrap(this.schema), this.wrap(this.table), pageSize);
        QueryUnit.runQuery(sql, this);
        ConnectionManager.changeActive(this)
    }

    public getToolTipe(meta: TableMeta): string {
        if (this.dbType == DatabaseType.MYSQL && meta.data_length) {
            return `AUTO_INCREMENT : ${meta.auto_increment || 'null'}
ROW_FORMAT : ${meta.row_format}
`
        }

        return ''
    }

    public insertSqlTemplate(show: boolean = true): Promise<string> {
        return new Promise((resolve) => {
            this
                .getChildren()
                .then((children: Node[]) => {
                    const childrenNames = children.map((child: any) => "\n    " + this.wrap(child.column.name));
                    const childrenValues = children.map((child: any) => "\n    $" + child.column.name);
                    let sql = `insert into \n  ${this.wrap(this.table)} `;
                    sql += `(${childrenNames.toString().replace(/,/g, ", ")}\n  )\n`;
                    sql += "values\n  ";
                    sql += `(${childrenValues.toString().replace(/,/g, ", ")}\n  );`;
                    if (show) {
                        QueryUnit.showSQLTextDocument(this, sql, Template.table);
                    }
                    resolve(sql)
                });
        })
    }

    public async selectSqlTemplate() {
        const sql = `SELECT * FROM ${Util.wrap(this.table)}`;
        QueryUnit.showSQLTextDocument(this, sql, Template.table);

    }

    public deleteSqlTemplate(): any {
        this
            .getChildren()
            .then((children: Node[]) => {
                const keysNames = children.filter((child: any) => child.column.key).map((child: any) => child.column.name);

                const where = keysNames.map((name: string) => `${this.wrap(name)} = \$${name}`);

                let sql = `delete from \n  ${this.wrap(this.table)} \n`;
                sql += `where \n  ${where.toString().replace(/,/g, "\n  and")}`;
                QueryUnit.showSQLTextDocument(this, sql, Template.table);
            });
    }

    public updateSqlTemplate() {
        this
            .getChildren()
            .then((children: Node[]) => {
                const keysNames = children.filter((child: any) => child.column.key).map((child: any) => child.column.name);
                const childrenNames = children.filter((child: any) => !child.column.key).map((child: any) => child.column.name);

                const sets = childrenNames.map((name: string) => `${name} = ${name}`);
                const where = keysNames.map((name: string) => `${name} = '${name}'`);

                let sql = `update \n  ${this.wrap(this.table)} \nset \n  ${sets.toString().replace(/,/g, ",\n  ")}\n`;
                sql += `where \n  ${where.toString().replace(/,/g, "\n  and ")}`;
                QueryUnit.showSQLTextDocument(this, sql, Template.table);
            });
    }

    public async getMaxPrimary(): Promise<number> {

        const primaryKey = MockRunner.primaryKeyMap[this.uid];
        if (primaryKey != null) {
            const count = await this.execute(`select max(${primaryKey}) max from ${this.wrap(this.table)}`);
            if (count && count[0]?.max) {
                const max = count[0].max;
                return Number.isInteger(max) || max.match(/^\d+$/) ? max : 0;
            }
        }


        return Promise.resolve(0)
    }

    public copyName(): void {
        Util.copyToBoard(this.table);
    }


}
