import { MockRunner } from "./mock/mockRunner";
import { ExtensionContext } from "vscode";
import { SqlViewManager } from "../common/SqlViewManager";
import { DatabaseCache } from "../database/DatabaseCache";
import { FileManager } from "./FileManager";

export class ServiceManager {

    public mockRunner: MockRunner;

    constructor(context: ExtensionContext) {
        this.mockRunner = new MockRunner();
        DatabaseCache.initCache(context);
        SqlViewManager.initExtesnsionPath(context.extensionPath);
        FileManager.init(context)
    }

}