import { FileModel } from "@/common/filesManager";
import { DbTreeDataProvider } from "@/provider/treeDataProvider";
import { DatabaseCache } from "@/service/common/databaseCache";
import { QueryUnit } from "@/service/queryUnit";
import * as vscode from "vscode";
import { DatabaseType, ModelType } from "../../common/constants";
import { Util } from '../../common/util';
import { ConnectionManager } from "../../service/connectionManager";
import { CopyAble } from "../interface/copyAble";
import { Node } from "../interface/node";
import { MongoTableGroup } from "../mongo/mongoTableGroup";

export class CatalogNode extends Node implements CopyAble {


    public contextValue: string = ModelType.CATALOG;
    public iconPath: string|vscode.ThemeIcon = new vscode.ThemeIcon("database");
    constructor(public database: string, readonly parent: Node) {
        super(database)
        this.init(this.parent)
        this.cacheSelf()
        const lcp = ConnectionManager.activeNode;
        if (this.isActive(lcp) && (lcp.database == this.database)) {
            if (Util.supportColorIcon()) {
                this.iconPath=new vscode.ThemeIcon("database", new vscode.ThemeColor('charts.blue'));
            }else{
                this.description = vscode.l10n.t(`Active`)
            }
        }
    }

    public getChildren(): Promise<Node[]> | Node[] {
          if(this.dbType==DatabaseType.MONGO_DB){
              return new MongoTableGroup(this).getChildren()
        }
        return this.parent.getChildren.call(this,true)
    }

    public async newQuery() {

        QueryUnit.showSQLTextDocument(this,'',`${this.database}.sql`,FileModel.APPEND)

    }

    public dropDatatabase() {

        vscode.window.showInputBox({
            prompt: vscode.l10n.t(`Are you sure you want to drop database {0} ?`, this.schema),
            placeHolder: vscode.l10n.t('Input database name to confirm.')
        }).then(async (inputContent) => {
            if (inputContent && inputContent.toLowerCase() == this.database.toLowerCase()) {
                this.execute(`DROP DATABASE ${this.wrap(this.database)}`).then(() => {
                    DatabaseCache.clearDatabaseCache(`${this.getConnectId()}`)
                    DbTreeDataProvider.refresh(this.parent);
                    vscode.window.showInformationMessage(vscode.l10n.t(`Drop database {0} success!`, this.schema))
                })
            } else {
                vscode.window.showInformationMessage(vscode.l10n.t(`Cancel drop database {0}!`, this.schema))
            }
        })

    }

    public copyName() {
        Util.copyToBoard(this.schema)
    }

}
