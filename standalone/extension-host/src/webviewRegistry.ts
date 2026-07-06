import type {
  HostWebviewPanelDto,
  WebviewPostMessagePayload
} from "@airdb-standalone/protocol";

export type WebviewMessageReceiver = (message: unknown) => void | Promise<void>;

export interface WebviewPanelRegistration {
  panelId: string;
  viewType: string;
  title: string;
  extensionId?: string;
  extensionPath: string;
  localResourceRoots?: string[];
}

interface WebviewPanelRecord extends WebviewPanelRegistration {
  html: string;
  receiveMessage: WebviewMessageReceiver;
}

export class WebviewRegistry {
  private readonly panels = new Map<string, WebviewPanelRecord>();

  registerPanel(panel: WebviewPanelRegistration, receiveMessage: WebviewMessageReceiver): void {
    this.panels.set(panel.panelId, {
      ...panel,
      localResourceRoots: panel.localResourceRoots ?? [`${panel.extensionPath.replace(/\\/g, "/")}/out/webview`],
      html: "",
      receiveMessage
    });
  }

  setHtml(panelId: string, html: string): HostWebviewPanelDto {
    const panel = this.getPanel(panelId);
    panel.html = html;
    return toDto(panel);
  }

  postMessage(panelId: string, message: unknown): WebviewPostMessagePayload {
    this.getPanel(panelId);
    return { panelId, message };
  }

  async receiveMessageFromIframe(panelId: string, message: unknown): Promise<boolean> {
    const panel = this.getPanel(panelId);
    await panel.receiveMessage(message);
    return true;
  }

  disposePanel(panelId: string): boolean {
    return this.panels.delete(panelId);
  }

  getDto(panelId: string): HostWebviewPanelDto {
    return toDto(this.getPanel(panelId));
  }

  private getPanel(panelId: string): WebviewPanelRecord {
    const panel = this.panels.get(panelId);
    if (!panel) {
      throw new Error(`Webview panel not found: ${panelId}`);
    }
    return panel;
  }
}

function toDto(panel: WebviewPanelRecord): HostWebviewPanelDto {
  return {
    panelId: panel.panelId,
    viewType: panel.viewType,
    title: panel.title,
    extensionId: panel.extensionId,
    html: panel.html,
    localResourceRoots: panel.localResourceRoots
  };
}
