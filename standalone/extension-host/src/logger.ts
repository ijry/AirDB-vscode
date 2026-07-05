export class Logger {
  constructor(private readonly writeLine: (line: string) => void = console.error) {}

  info(message: string): void {
    this.writeLine(`[extension-host] ${message}`);
  }

  error(message: string, error?: unknown): void {
    const suffix = error instanceof Error ? `: ${error.message}` : "";
    this.writeLine(`[extension-host] ERROR ${message}${suffix}`);
  }
}
