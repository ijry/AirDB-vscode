import {
  RequestStore,
  createNotification,
  type HostMessageGroup,
  type HostRequest,
  type HostResponse
} from "@airdb-standalone/protocol";
import type { HostBridge, WebviewPanelBridgeRegistration } from "@airdb-standalone/vscode-shim";
import type { TreeViewRegistry } from "./treeViewRegistry.js";
import type { WebviewMessageReceiver, WebviewRegistry } from "./webviewRegistry.js";

export class IpcBridge implements HostBridge {
  private readonly requests = new RequestStore();

  constructor(
    private readonly write: (line: string) => void,
    private readonly treeViewRegistry?: TreeViewRegistry,
    private readonly webviewRegistry?: WebviewRegistry
  ) {}

  async request<TResponse>(request: HostRequest): Promise<TResponse> {
    const response = this.requests.register<TResponse>(request.id, 30000);
    this.write(JSON.stringify(request));
    return response;
  }

  handleResponse(response: HostResponse): boolean {
    return this.requests.resolve(response);
  }

  notify(group: HostMessageGroup, payload: unknown, extensionId?: string): void {
    this.write(JSON.stringify(createNotification(group, payload, extensionId)));
  }

  registerTreeView(viewId: string, treeOptions: unknown, extensionId?: string): void {
    this.treeViewRegistry?.registerTreeView(viewId, treeOptions, extensionId);
    this.notify("tree.create", { viewId }, extensionId);
  }

  registerWebviewPanel(panel: WebviewPanelBridgeRegistration, receiveMessage: WebviewMessageReceiver): void {
    this.webviewRegistry?.registerPanel(panel, receiveMessage);
    const payload = this.webviewRegistry?.getDto(panel.panelId) ?? { ...panel, html: "" };
    this.notify("webview.create", payload, panel.extensionId);
  }

  setWebviewHtml(panelId: string, html: string, extensionId?: string): void {
    const payload = this.webviewRegistry?.setHtml(panelId, html) ?? { panelId, html };
    this.notify("webview.setHtml", payload, extensionId);
  }

  async postWebviewMessage(panelId: string, message: unknown, extensionId?: string): Promise<boolean> {
    const payload = this.webviewRegistry?.postMessage(panelId, message) ?? { panelId, message };
    this.notify("webview.postMessage", payload, extensionId);
    return true;
  }

  disposeWebviewPanel(panelId: string): void {
    this.webviewRegistry?.disposePanel(panelId);
  }
}
