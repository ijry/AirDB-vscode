import * as path from 'path';
import * as vscode from "vscode";
import * as fs from 'fs';

export class FileManager {

    public static storagePath: string;
    public static init(context: vscode.ExtensionContext) {
        this.storagePath = context.globalStoragePath;
    }

    public static show(fileName: string): Promise<vscode.TextEditor> {
        if (!this.storagePath) { vscode.window.showErrorMessage("FileManager is not init!") }
        if (!fileName) { return; }
        const recordPath = path.isAbsolute(fileName) ? fileName : `${this.storagePath}/${fileName}`;
        this.check(path.resolve(recordPath, '..'))
        if (!fs.existsSync(recordPath)) {
            fs.appendFileSync(recordPath, "");
        }
        const openPath = vscode.Uri.file(recordPath);
        // Both stages must be able to reject: the executor had no reject parameter
        // and no rejection handler, so a document that could not be opened (deleted
        // underneath us, locked, past the size limit) left every awaiting caller
        // hanging forever.
        return new Promise((resolve, reject) => {
            vscode.workspace.openTextDocument(openPath).then(
                async (doc) => {
                    try {
                        resolve(await vscode.window.showTextDocument(doc));
                    } catch (err) {
                        reject(err);
                    }
                },
                reject
            );
        })

    }

    public static record(fileName: string, content: string, model?: FileModel): Promise<string> {
        if (!this.storagePath) { vscode.window.showErrorMessage("FileManager is not init!") }
        if (!fileName) { return; }
        fileName=fileName.replace(/[\:\*\?"\<\>]*/g,"")
        return new Promise((resolve) => {
            const recordPath = `${this.storagePath}/${fileName}`;
            this.check(path.resolve(recordPath, '..'))
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }
            if (model == FileModel.WRITE) {
                fs.writeFileSync(recordPath, `${content}`, { encoding: 'utf8' });
            } else {
                fs.appendFileSync(recordPath, `${content}`, { encoding: 'utf8' });
            }
            resolve(recordPath)
        });
    }

    public static getPath(fileName:string){
        return `${this.storagePath}/${fileName}`;
    }


    private static check(checkPath: string) {
        if (!fs.existsSync(checkPath)) { this.recursiseCreate(checkPath) }

    }


    /**
     * get from StackOverFlow
     * @param folderPath 
     */
    private static recursiseCreate(folderPath: string) {
        folderPath.split(path.sep)
            .reduce((prevPath, folder) => {
                const currentPath = path.join(prevPath, folder, path.sep);
                if (!fs.existsSync(currentPath)) {
                    fs.mkdirSync(currentPath, { recursive: true });
                }
                return currentPath;
            }, '');
    }

}

export enum FileModel {
    WRITE, APPEND
}