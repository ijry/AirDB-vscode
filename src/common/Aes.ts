
import * as vscode from "vscode";
import { GlobalState } from "./state";
import crypto from 'crypto';

export class Aes {

    public getIv() {
        return crypto.randomBytes(16).toString('hex'); // 生成随机的IV  
    }

    public aesEncrypt(text: string, secretKey: string) {  
        let algorithm = 'aes-256-cbc'; // 你可以根据需要选择其他算法，如 aes-128-cbc  
        let key = crypto.createHash('sha256').update(secretKey).digest('base64').substr(0, 32); // 密钥需要是32字节（AES-256）  
        let iv = this.getIv();
      
        let cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'utf8'), Buffer.from(iv, 'hex'));  
        let encrypted = cipher.update(text, 'utf8', 'hex');  
        encrypted += cipher.final('hex');  
      
        // 返回IV和加密后的文本，以便解密时使用  
        return { iv: iv, encryptedData: encrypted };  
    }

    public aesDecrypt(text: string, secretKey: string, iv: string) {  
        let algorithm = 'aes-256-cbc';
        let key = crypto.createHash('sha256').update(secretKey).digest('base64').substr(0, 32);  
        let decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'utf8'), Buffer.from(iv, 'hex'));  
        let decrypted = decipher.update(text, 'hex', 'utf8');  
        decrypted += decipher.final('utf8');
        return decrypted;  
    }

    // 加密数据库连接的密码主要用于云端同步避免泄露
    public encryptPassword(password: string): object {
        if (password == '') {
            return {
                iv: '',
                password: ''
            }
        }
        // 获取本地存储的主密码
        let mainPwd = GlobalState.get<any>('mainPwd') || '';
        if (!mainPwd) {
            // 不存在主密码弹窗让设置
            if (!this.setMainPwd()) {
                throw new Error("main password not set correct");
            }
            mainPwd = GlobalState.get<any>('mainPwd') || '';
            if (!mainPwd) {
                throw new Error("main password not set correct");
            }
        }
        let res = this.aesEncrypt(password + '-airdb', mainPwd);

        return {
            iv: res.iv,
            password: res.encryptedData
        };
    }

    // 密码解密
    public  decryptPassword(aesPwd: string, iv: string): string {
        if (aesPwd == '') return '';

        let password = '';
        // 获取本地存储的主密码
        let mainPwd = GlobalState.get<any>('mainPwd') || '';
        if (!mainPwd) {
            // 不存在主密码弹窗让设置
            if (!this.setMainPwd()) {
                throw new Error("main password not set correct");
            }
            mainPwd = GlobalState.get<any>('mainPwd') || '';
            if (!mainPwd) {
                throw new Error("main password not set correct");
            }
        }
        password = this.aesDecrypt(aesPwd, mainPwd, iv);

        return password.slice(0, -6);
    }

    public validatePassword(password: string) {  
        const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;
        return regex.test(password);  
      }

    public setMainPwd(): boolean {
        vscode.window.showInputBox({
            prompt: `Set a main password to encrypt your db's password in cloud sync`,
            placeHolder: 'Input main password' }).then(async (inputContent) => {
            if (inputContent) {
                if (this.validatePassword(inputContent.trim())) {
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

}
