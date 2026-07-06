import { Disposable } from "./types.js";

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

export interface BuiltInCommandResult {
  handled: boolean;
  value?: unknown;
}

export type BuiltInCommandHandler = (command: string, args: unknown[]) =>
  BuiltInCommandResult | Promise<BuiltInCommandResult>;

export interface CommandsApi {
  registerCommand(command: string, handler: CommandHandler): Disposable;
  executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T>;
  has(command: string): boolean;
}

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

export function createCommandsApi(
  registry: CommandRegistry,
  builtInHandler?: BuiltInCommandHandler
): CommandsApi {
  return {
    registerCommand(command, handler) {
      return registry.registerCommand(command, handler);
    },
    async executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
      const builtInResult = await builtInHandler?.(command, args);
      if (builtInResult?.handled) {
        return builtInResult.value as T;
      }
      return registry.executeCommand<T>(command, ...args);
    },
    has(command) {
      return command === "vscode.open" || registry.has(command);
    }
  };
}
