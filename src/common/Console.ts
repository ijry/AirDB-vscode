"user strict";
import * as vscode from "vscode";
import format = require('date-format');

export class Console {
    public static log(value: any) {
        if (this.outputChannel == null) {
            this.outputChannel = vscode.window.createOutputChannel("MySQL");
        }
        if(value instanceof Error){
            console.trace(value)
        }
        this.outputChannel.show(true);
        const begin = format('yyyy-MM-dd hh:mm:ss', new Date());
        this.outputChannel.appendLine(`${begin} ${value}`);
    }

    /**
     * Shows an error to the user and marks it as reported, so an outer handler
     * (notably the command wrapper) does not pop up a second notification for the
     * same failure.
     */
    public static reportError(error: any, prefix?: string) {
        const message = error?.message || String(error);
        if (error && typeof error == 'object') {
            if (error[Console.REPORTED]) {
                return;
            }
            try {
                error[Console.REPORTED] = true;
            } catch (ignored) {
                // frozen error object; showing it twice is better than crashing
            }
        }
        vscode.window.showErrorMessage(prefix ? `${prefix}: ${message}` : message);
        Console.log(error instanceof Error ? error : message);
    }

    /** True when reportError already showed this error to the user. */
    public static isReported(error: any): boolean {
        return !!(error && typeof error == 'object' && error[Console.REPORTED]);
    }

    private static readonly REPORTED = Symbol.for('airdb.errorReported');

    public static ling(){
        if (this.outputChannel == null) {
            this.outputChannel = vscode.window.createOutputChannel("MySQL");
        }
        this.outputChannel.appendLine("-----------------------------------------------------------------------------------------");
    }

    private static outputChannel: vscode.OutputChannel;
}
