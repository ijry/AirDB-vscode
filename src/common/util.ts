
import { join } from "path";
import * as vscode from "vscode";
import { Position, TextDocument } from "vscode";
import { Confirm, Constants, DatabaseType } from "./constants";
import { exec } from "child_process";
import { wrapByDb } from "./wrapper.js";
import { GlobalState } from "./state";
import { Console } from "./Console";
import crypto from 'crypto';

export class Util {

    public static getIv() {
        return crypto.randomBytes(16); // 生成随机的IV  
    }

    public static aesEncrypt(text: string, secretKey: string) {  
        let algorithm = 'aes-256-cbc'; // 你可以根据需要选择其他算法，如 aes-128-cbc  
        let key = crypto.createHash('sha256').update(secretKey).digest('base64').substr(0, 32); // 密钥需要是32字节（AES-256）  
        let iv = Util.getIv();
      
        let cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'utf8'), iv);  
        let encrypted = cipher.update(text, 'utf8', 'hex');  
        encrypted += cipher.final('hex');  
      
        // 返回IV和加密后的文本，以便解密时使用  
        return { iv: iv, encryptedData: encrypted };  
    }

    public static aesDecrypt(text: string, secretKey: string, iv: string) {  
        let algorithm = 'aes-256-cbc';
        let key = crypto.createHash('sha256').update(secretKey).digest('base64').substr(0, 32);  
        let decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'utf8'), Buffer.from(iv, 'hex'));  
        let decrypted = decipher.update(text, 'hex', 'utf8');  
        decrypted += decipher.final('utf8');
        return decrypted;  
    }

    // 加密数据库连接的密码主要用于云端同步避免泄露
    public static encryptPassword(password: string): object {
        if (password == '') return {
            iv: '',
            password: ''
        }

        // 获取本地存储的主密码
        let mainPwd = GlobalState.get<any>('mainPwd') || '';
        if (!mainPwd) {
            // 不存在主密码弹窗让设置
            if (!Util.setMainPwd()) {
                throw new Error("main password not set correct");
            }
            mainPwd = GlobalState.get<any>('mainPwd') || '';
            if (!mainPwd) {
                throw new Error("main password not set correct");
            }
        }
        let res = Util.aesEncrypt(password + '-airdb', mainPwd);

        return {
            iv: res.iv,
            password: res.encryptedData
        };
    }

    // 密码解密
    public static decryptPassword(aesPwd: string, iv: string): string {
        if (aesPwd == '') return '';

        let password = '';
        // 获取本地存储的主密码
        let mainPwd = GlobalState.get<any>('mainPwd') || '';
        if (!mainPwd) {
            // 不存在主密码弹窗让设置
            if (!Util.setMainPwd()) {
                throw new Error("main password not set correct");
            }
            mainPwd = GlobalState.get<any>('mainPwd') || '';
            if (!mainPwd) {
                throw new Error("main password not set correct");
            }
        }
        password = Util.aesDecrypt(aesPwd, mainPwd, iv);

        return password.slice(0, -6);
    }

    public static validatePassword(password: string) {  
        const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;  
        return regex.test(password);  
      }

      public static setMainPwd(): boolean {
        vscode.window.showInputBox({
            prompt: `Set a main password to encrypt your db's password in cloud sync`,
            placeHolder: 'Input main password' }).then(async (inputContent) => {
            if (inputContent) {
                if (Util.validatePassword(inputContent.trim())) {
                    // todo检测填写的密码是否与以前的密码一致，如果不一致提示用户是否需要重置密码，
                    // todo如果要重置密码，那么所有历史连接的密码都无法恢复。
                    GlobalState.update('mainPwd', inputContent.trim());
                    vscode.window.showInformationMessage(`Main password set success!`)
                    return true;
                } else {
                    vscode.window.showErrorMessage(
                        `Require the main password to contain uppercase letters, lowercase letters, digits, and special characters.`
                    )
                }
            } else {
                vscode.window.showErrorMessage(`Cancel`)
            }
        })
        return false;
    }

    public static getTableName(sql: string, tablePattern: string): string {

        const tableMatch = new RegExp(tablePattern, 'img').exec(sql)
        if (tableMatch) {
            return tableMatch[0].replace(/\bfrom|join|update|into\b/i, "") // remove keyword
                .replace(/`|"|'/g, "")// trim tableName
                .replace(/^\s*\[(.+)\]$/, "$1") // trim tableName again
                .trim()
        }

        return null;
    }

    /**
     * wrap origin with ` if is unusual identifier
     * @param origin any string
     */
    public static wrap(origin: string, databaseType?: DatabaseType) {
        return wrapByDb(origin, databaseType)
    }

    public static trim(origin: any): any {

        if (origin) {
            const originType = typeof origin
            if (originType == "string") {
                return origin.trim()
            }
            if (originType == "object") {
                for (const key in origin) {
                    origin[key] = this.trim(origin[key])
                }
            }
        }

        return origin
    }

    /**
     * trim array, got from SO.
     * @param origin origin array
     * @param attr duplicate check attribute
     */
    public static trimArray<T>(origin: T[], attr: string): T[] {
        const seen = new Set();
        return origin.filter((item) => {
            const temp = item[attr];
            return seen.has(temp) ? false : seen.add(temp);
        });
    }

    public static getDocumentLastPosition(document: TextDocument): Position {
        const lastLine = document.lineCount - 1;
        return new Position(lastLine, document.lineAt(lastLine).text.length);
    }

    public static copyToBoard(content: string) {
        vscode.env.clipboard.writeText(content)
    }

    public static confirm(placeHolder: string, callback: () => void) {
        vscode.window.showQuickPick([Confirm.YES, Confirm.NO], { placeHolder }).then((res) => {
            if (res == Confirm.YES) {
                callback()
            }
        })
    }

    public static async(callback: (res, rej) => void): Promise<any> {
        return new Promise((resolve, reject) => callback(resolve, reject))
    }

    public static process(title: string, task: (done) => void) {
        vscode.window.withProgress({ title, location: vscode.ProgressLocation.Notification }, () => {
            return new Promise(async (resolve) => {
                try {
                    task(resolve)
                } catch (error) {
                    vscode.window.showErrorMessage(error.message)
                }
            })
        })
    }

    public static getExtPath(...paths: string[]) {

        return vscode.Uri.file(join(Constants.RES_PATH, ...paths))
    }

    public static getStore(key: string): any {
        return GlobalState.get(key);
    }
    public static store(key: string, object: any) {
        GlobalState.update(key, object)
    }

    public static is(object: any, type: string): boolean {
        if (!object) return false;
        return object.__proto__.constructor.name == type;
    }


    private static supportColor: boolean = null;
    /**
     * Check current vscode treeitem support ref theme icon with color.
     */
    public static supportColorIcon(): boolean {

        if (this.supportColor === null) {
            try {
                new vscode.ThemeIcon("key", new vscode.ThemeColor('charts.yellow'));
                this.supportColor = true;
            } catch (error) {
                this.supportColor = false;
            }
        }

        return this.supportColor;
    }

    public static execute(command: string): Promise<void> {
        return new Promise((res, rej) => {
            let hasTrigger = false;
            exec(command, (err, stdout, stderr) => {
                if (hasTrigger) return;
                if (err) {
                    rej(err)
                } else if (stderr) {
                    rej(stderr)
                } else if(!hasTrigger){
                    hasTrigger = true;
                    res(null)
                }
            }).on("exit", (code) => {
                if (!hasTrigger && code===0){
                    hasTrigger = true;
                    res(null)
                };
            })
        })
    }

}
