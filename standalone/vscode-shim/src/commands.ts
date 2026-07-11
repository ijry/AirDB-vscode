import { Disposable } from "./types.js";

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

export interface ContextKeyChange {
  key: string;
  value: unknown;
  context: Record<string, unknown>;
}

export type ContextKeyChangeListener = (change: ContextKeyChange) => void;

export interface BuiltInCommandResult {
  handled: boolean;
  value?: unknown;
}

export type BuiltInCommandHandler = (command: string, args: unknown[]) =>
  BuiltInCommandResult | Promise<BuiltInCommandResult>;

export interface CommandsApi {
  registerCommand(command: string, handler: CommandHandler): Disposable;
  executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T>;
  getCommands(filterInternal?: boolean): Promise<string[]>;
  has(command: string): boolean;
}

const BUILT_IN_COMMANDS = ["setContext", "vscode.open"] as const;

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly contextKeys = new Map<string, unknown>();
  private readonly contextListeners = new Set<ContextKeyChangeListener>();

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

  getCommands(filterInternal = false): string[] {
    const commands = [...this.handlers.keys()];
    return filterInternal ? commands.filter(isPublicCommand) : commands;
  }

  setContext(key: string, value: unknown): void {
    if (!key) {
      throw new Error("setContext requires a non-empty context key");
    }
    if (value === undefined) {
      this.contextKeys.delete(key);
    } else {
      this.contextKeys.set(key, value);
    }
    this.notifyContextChange(key, value);
  }

  getContextValue(key: string): unknown {
    return this.contextKeys.get(key);
  }

  getContextSnapshot(): Record<string, unknown> {
    return Object.fromEntries(this.contextKeys);
  }

  onDidChangeContext(listener: ContextKeyChangeListener): Disposable {
    this.contextListeners.add(listener);
    return new Disposable(() => this.contextListeners.delete(listener));
  }

  private notifyContextChange(key: string, value: unknown): void {
    const change = { key, value, context: this.getContextSnapshot() };
    for (const listener of this.contextListeners) {
      listener(change);
    }
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
      if (command === "setContext") {
        const [key, value] = args;
        if (typeof key !== "string") {
          throw new Error("setContext requires a string context key");
        }
        registry.setContext(key, value);
        return undefined as T;
      }
      const builtInResult = await builtInHandler?.(command, args);
      if (builtInResult?.handled) {
        return builtInResult.value as T;
      }
      return registry.executeCommand<T>(command, ...args);
    },
    async getCommands(filterInternal = false) {
      const registeredCommands = registry.getCommands(filterInternal);
      if (filterInternal) {
        return registeredCommands;
      }
      return [...new Set([...BUILT_IN_COMMANDS, ...registeredCommands])];
    },
    has(command) {
      return BUILT_IN_COMMANDS.includes(command as typeof BUILT_IN_COMMANDS[number]) || registry.has(command);
    }
  };
}

function isPublicCommand(command: string): boolean {
  return !command.startsWith("_");
}
