import { Disposable } from "./types";

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  registerCommand(command: string, handler: CommandHandler): Disposable {
    this.handlers.set(command, handler);
    return new Disposable(() => this.handlers.delete(command));
  }

  async executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
    const handler = this.handlers.get(command);
    if (!handler) {
      throw new Error(`Command not found: ${command}`);
    }
    return (await handler(...args)) as T;
  }

  has(command: string): boolean {
    return this.handlers.has(command);
  }
}
