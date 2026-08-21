import { Client } from "ssh2";
import * as vscode from 'vscode';
import { TerminalService } from "./terminalService";
import { TerminalTitle } from "./constant";
import { FileManager, FileModel } from "@/common/filesManager";
import { Util } from "@/common/util";
import { Hanlder, ViewManager } from "@/common/viewManager";
import { SSHConfig } from "@/model/interface/sshConfig";

interface TerminalSession {
    /** unique webview panel type, also the key inside XtermTerminal.sessions */
    panelType: string;
    sshUrl: string;
    handler: Hanlder;
    client?: Client;
    /** true once the shell is up and the session can accept a `cd` */
    ready?: boolean;
}

export class XtermTerminal implements TerminalService {

    /**
     * Live terminals keyed by panel type. The panel type is unique per panel, so
     * several terminals on the same host no longer overwrite each other's entry.
     */
    private static sessions = new Map<string, TerminalSession>();
    /** sshUrl -> panelType that openPath should reuse (the most recently ready one) */
    private static activeByUrl = new Map<string, string>();
    /** sshUrl -> terminal currently being opened, so rapid clicks share one terminal */
    private static opening = new Map<string, Promise<Hanlder>>();
    private static panelSeq = 0;

    private getSshUrl(sshConfig: SSHConfig): string {
        return 'ssh://' + sshConfig.username + '@' + sshConfig.host + ':' + sshConfig.port;
    }

    public async openPath(sshConfig: SSHConfig, fullPath: string) {

        const sshUrl = this.getSshUrl(sshConfig);
        const cd = (handler: Hanlder) => { if (handler) { handler.emit('path', fullPath) } };

        const live = XtermTerminal.activeSession(sshUrl);
        if (live && this.reveal(live)) {
            cd(live.handler);
            return;
        }

        // A second click while the first terminal is still connecting rides that
        // terminal instead of racing it into a second panel.
        const opening = XtermTerminal.opening.get(sshUrl);
        if (opening) {
            cd(await opening);
            return;
        }

        cd(await this.openMethod(sshConfig));
    }

    /**
     * Opens a terminal and resolves once its shell is ready, or with null when the
     * panel is closed or the connection fails before that happens.
     */
    public async openMethod(sshConfig: SSHConfig): Promise<Hanlder> {

        const sshUrl = this.getSshUrl(sshConfig);
        // Always a fresh type: deriving it from the session map raced with the SSH
        // handshake, so two quick clicks both got the bare sshUrl, hit ViewManager's
        // single-page reuse branch and tore the listeners off the live terminal.
        const panelType = `${sshUrl}#${++XtermTerminal.panelSeq}`;

        let settle: (handler: Hanlder) => void;
        const ready = new Promise<Hanlder>(resolve => { settle = resolve });
        XtermTerminal.opening.set(sshUrl, ready);
        const done = (handler: Hanlder) => {
            if (XtermTerminal.opening.get(sshUrl) === ready) {
                XtermTerminal.opening.delete(sshUrl);
            }
            settle(handler);
        };

        try {
            await ViewManager.createWebviewPanel({
                splitView: false, path: "app", iconPath: {
                    light: Util.getExtPath("image", "terminal_light.png"),
                    dark: Util.getExtPath("image", "terminal_dark.svg"),
                },
                title: this.getTitle(sshConfig), type: panelType,
                eventHandler: (handler) => {
                    this.handlerEvent(panelType, sshUrl, handler, sshConfig, done)
                }
            })
        } catch (err) {
            vscode.window.showErrorMessage(
                vscode.l10n.t(`Open terminal failed: {0}`, err?.message || err)
            );
            done(null);
        }

        return ready;
    }

    private handlerEvent(panelType: string, sshUrl: string, handler: Hanlder, sshConfig: SSHConfig, done: (handler: Hanlder) => void) {

        const fontSize = vscode.workspace.getConfiguration("terminal.integrated").get("fontSize", 16)

        const session: TerminalSession = { panelType, sshUrl, handler };
        XtermTerminal.sessions.set(panelType, session);

        // The webview never emits 'dispose', so the panel is the only reliable signal
        // that a terminal is gone. Without this the session leaked and the next
        // "open in terminal" revealed a disposed panel and silently did nothing.
        handler.panel.onDidDispose(() => {
            session.client?.end();
            XtermTerminal.drop(session);
            done(null);
        })

        let dataBuffer = [];
        handler.on("init", () => {
            handler.emit("route", 'sshTerminal')
        }).on("route-sshTerminal", () => {
            handler.emit("terminalConfig", { fontSize })
        }).on("initTerminal", (content) => {
            handler.emit('connecting', `connecting ${sshConfig.username}@${sshConfig.host}...\n`);
            let termCols: number, termRows: number;
            if (content) {
                termCols = content.cols;
                termRows = content.rows
            }
            const client = new Client()
            session.client = client
            const end = () => { client.end(); XtermTerminal.drop(session); }
            const SSHerror = (message: string, err: any) => {
                handler.emit('ssherror', (err) ? `${message}: ${err.message}` : message);
                end();
                done(null);
            }
            client.on('ready', () => {
                session.ready = true
                XtermTerminal.activeByUrl.set(sshUrl, panelType)
                client.shell({ term: 'xterm-color', cols: termCols, rows: termRows }, (err, stream) => {
                    if (err) {
                        SSHerror('EXEC ERROR' + err, null)
                        return
                    }
                    handler.emit('header', '')
                    handler.emit('status', 'SSH CONNECTION ESTABLISHED')
                    handler.on('data', (data: string) => {
                        stream.write(data)
                    }).on('resize', (data) => {
                        stream.setWindow(data.rows, data.cols, data.height, data.width)
                    }).on('openLink', uri => {
                        vscode.env.openExternal(vscode.Uri.parse(uri));
                    }).on('dispose', () => {
                        end()
                    })
                    stream.on('data', (data) => {
                        handler.emit('data', data.toString('utf-8'));
                        dataBuffer = dataBuffer.concat(data)
                    })
                    stream.on('close', (code, signal) => {
                        handler.emit('ssherror', 'ssh serssion is close.')
                        end()
                    })
                    done(handler)
                })
            })
            // client.on('banner', (data: string) => handler.emit('data', data.replace(/\r?\n/g, '\r\n')))
            client.on('end', (err) => { SSHerror('CONN END BY HOST', err) })
            client.on('close', (err) => { SSHerror('CONN CLOSE', err) })
            client.on('error', (err) => { SSHerror('CONN ERROR', err) })
            client.on('keyboard-interactive', () => {
                end();
                done(null);
            })
            client.connect(sshConfig)
        }).on('openLog', async () => {
            const filePath = sshConfig.username + '@' + sshConfig.host
            await FileManager.record(filePath, dataBuffer.toString().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''), FileModel.WRITE)
            FileManager.show(filePath).then((textEditor: vscode.TextEditor) => {
                const lineCount = textEditor.document.lineCount;
                const range = textEditor.document.lineAt(lineCount - 1).range;
                textEditor.selection = new vscode.Selection(range.end, range.end);
                textEditor.revealRange(range);
            })
        })

    }

    private static activeSession(sshUrl: string): TerminalSession {
        const panelType = this.activeByUrl.get(sshUrl);
        return panelType ? this.sessions.get(panelType) : null;
    }

    private static drop(session: TerminalSession) {
        session.ready = false;
        if (this.sessions.get(session.panelType) === session) {
            this.sessions.delete(session.panelType);
        }
        // Only clear the host pointer while it still points at us: a second terminal
        // on the same host must not be unregistered by the first one closing.
        if (this.activeByUrl.get(session.sshUrl) !== session.panelType) {
            return;
        }
        this.activeByUrl.delete(session.sshUrl);
        for (const candidate of this.sessions.values()) {
            if (candidate.sshUrl === session.sshUrl && candidate.ready) {
                this.activeByUrl.set(session.sshUrl, candidate.panelType);
                return;
            }
        }
    }

    private reveal(session: TerminalSession): boolean {
        try {
            session.handler.panel.reveal()
            return true
        } catch (err) {
            // Panel is already gone even though onDidDispose never ran: forget it so
            // the caller opens a fresh terminal instead of silently doing nothing.
            XtermTerminal.drop(session)
            return false
        }
    }

    private getTitle(sshConfig: SSHConfig): string {
        const type = vscode.workspace.getConfiguration("vscode-ssh").get<TerminalTitle>("terimanlTitle");
        // if (type == TerminalTitle.connectionName && sshConfig.name) {
        // return sshConfig.name;
        // }
        return `${sshConfig.username}@${sshConfig.host}`
    }

}
