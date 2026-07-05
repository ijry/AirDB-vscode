import type { HostMessage } from "./messages";

export function encodeJsonLine(message: HostMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export class JsonLineDecoder {
  private buffer = "";

  push(chunk: string): HostMessage[] {
    this.buffer += chunk;
    const messages: HostMessage[] = [];

    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd === -1) {
        break;
      }

      const line = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);

      if (line.length === 0) {
        continue;
      }

      messages.push(JSON.parse(line) as HostMessage);
    }

    return messages;
  }
}
