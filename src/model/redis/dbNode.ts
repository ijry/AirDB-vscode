import { Constants, ModelType } from "@/common/constants";
import { Util } from "@/common/util";
import { Node } from "@/model/interface/node";
import * as path from "path";
import * as vscode from "vscode";
import { ThemeColor, ThemeIcon } from "vscode";
import KeyNode from "./keyNode";
import RedisBaseNode from "./redisBaseNode";
import { RedisFolderNode } from "./folderNode";
import { InfoNode } from "../other/infoNode";
// import { Console } from "console";
import { Console } from "../../common/Console";

export class DbNode extends RedisBaseNode {

    contextValue = ModelType.REDIS_FOLDER;

    readonly iconPath: string | vscode.ThemeIcon = path.join(Constants.RES_PATH, `icon/database-container.svg`);

    constructor(readonly info: any, readonly parent: RedisBaseNode) {
        info.name = 'db' + info.name
        super(info.name) // 数据库的名称作为树的标题
        // this.meta = info;
        this.parent = parent;
        this.contextValue = ModelType.REDIS_DB;
        this.iconPath = new vscode.ThemeIcon("database", new vscode.ThemeColor("dropdown.foreground"));
        this.init(info);
        this.database = info.name;
        this.description = info.keys ? `(${info.keys})` : "";
        this.level = parent.hasOwnProperty('level') ? parent.level + 1 : 0
    }

    async getChildren(initialCall: boolean) {  
      // 如果initialCall为真，或者当前没有keyList，或者keyList长度为0，则重置currentOffset和currentTemp，并保存状态  
      if (initialCall || !this.keyList || this.keyList.length === 0) {  
          this.currentOffset = "0";  
          this.currentTemp = {};  
          this.keyList = await this.getKeyList(); // 假设getKeys方法异步获取keys  
      }  
    
      // 构建子节点  
      let children = await RedisFolderNode.buildChildren(this, this.keyList);  
    
      // 如果还有更多数据并且children数组为空，则添加一个特殊的节点表示无数据  
      if (this.hasLeftData() && children.length === 0) {  
          let message = this.contextValue === "redisFolder" ? "Folder empty" : "Database empty.";  
          // children.unshift(new InfoNode(message)); // 假设at是一个构造函数，用于创建无数据时的提示节点  
      }  
      Console.log(JSON.stringify(children))
    
      // 返回子节点数组  
      return children;  
    }
    hasLeftData() {
      for (let index in this.currentTemp)
        if (this.currentTemp[index] != "0") return !0;
      return !1;
    }
    async openTerminal() {
      this.parent.openTerminal.call(this);
    }

    async getNextPage() {
      let list = await this.getKeyList();
      this.keyList.push(...list);
      // this.provider.reload(this);
    }

}
