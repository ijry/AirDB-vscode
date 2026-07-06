import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  RequestStore,
  createRequest,
  type HostMessage,
  type HostMessageGroup,
  type HostResponse
} from "@airdb-standalone/protocol";

type Unlisten = () => void;

export interface HostBridgeTransport {
  listen(onMessage: (message: HostMessage) => void): Promise<Unlisten>;
  send(message: string): Promise<void>;
}

export function createHostBridge(transport: HostBridgeTransport = createTauriTransport()) {
  const requests = new RequestStore();
  let unlisten: Unlisten | undefined;

  return {
    async start(onMessage: (message: HostMessage) => void): Promise<Unlisten> {
      unlisten = await transport.listen((message) => {
        if (message.kind === "response" && requests.resolve(message as HostResponse)) {
          return;
        }
        onMessage(message);
      });

      return () => {
        unlisten?.();
        unlisten = undefined;
      };
    },

    async sendHostRequest<TResponse>(
      group: HostMessageGroup,
      payload: unknown,
      extensionId?: string,
      timeoutMs = 5000
    ): Promise<TResponse> {
      const request = createRequest(group, payload, extensionId);
      const response = requests.register<TResponse>(request.id, timeoutMs);
      await transport.send(JSON.stringify(request));
      return response;
    },

    async sendHostResponse(response: HostResponse): Promise<void> {
      await transport.send(JSON.stringify(response));
    }
  };
}

export const defaultHostBridge = createHostBridge();

export async function listenToHostMessages(onMessage: (message: HostMessage) => void) {
  return defaultHostBridge.start(onMessage);
}

export function sendHostRequest<TResponse>(
  group: HostMessageGroup,
  payload: unknown,
  extensionId?: string,
  timeoutMs?: number
) {
  return defaultHostBridge.sendHostRequest<TResponse>(group, payload, extensionId, timeoutMs);
}

export function sendHostResponse(response: HostResponse) {
  return defaultHostBridge.sendHostResponse(response);
}

export function parseHostMessagePayload(payload: string): HostMessage | undefined {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return isHostMessage(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function createTauriTransport(): HostBridgeTransport {
  return {
    async listen(onMessage) {
      return listen<string>("extension-host-message", (event) => {
        const message = parseHostMessagePayload(event.payload);
        if (message) {
          onMessage(message);
        }
      });
    },
    async send(message) {
      await invoke("send_extension_host_message", { message });
    }
  };
}

function isHostMessage(value: unknown): value is HostMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.group !== "string") {
    return false;
  }
  if (record.extensionId !== undefined && typeof record.extensionId !== "string") {
    return false;
  }

  switch (record.kind) {
    case "request":
      return typeof record.id === "string" && hasOwn(record, "payload");
    case "response":
      return typeof record.id === "string" && typeof record.ok === "boolean";
    case "notification":
      return hasOwn(record, "payload");
    default:
      return false;
  }
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
