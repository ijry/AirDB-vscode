import { JsonLineDecoder, type HostMessage, type HostResponse } from "@airdb-standalone/protocol";

export interface MessageController {
  handleMessage(message: HostMessage): Promise<HostResponse | undefined>;
}

export function startStdinMessageLoop(
  input: NodeJS.ReadableStream,
  controller: MessageController,
  writeLine: (line: string) => void
): void {
  const decoder = new JsonLineDecoder();

  input.setEncoding("utf8");
  input.on("data", (chunk: string) => {
    for (const message of decoder.push(chunk)) {
      void controller
        .handleMessage(message)
        .then((response) => {
          if (response) {
            writeLine(JSON.stringify(response));
          }
        })
        .catch((error: unknown) => {
          writeLine(
            JSON.stringify({
              kind: "notification",
              group: "log",
              payload: {
                level: "error",
                message: error instanceof Error ? error.message : String(error)
              }
            })
          );
        });
    }
  });
}
