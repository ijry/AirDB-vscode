import type {
  HostTreeCommandDto,
  HostTreeNodeDto,
  ResolveTreeChildrenResponse
} from "@airdb-standalone/protocol";
import type { CommandRegistry } from "@airdb-standalone/vscode-shim";

interface TreeDataProvider {
  getChildren(element?: unknown): unknown[] | Promise<unknown[]>;
  getTreeItem(element: unknown): TreeItemLike | Promise<TreeItemLike>;
}

interface TreeItemLike {
  label?: string | { label?: string; highlights?: unknown };
  description?: string | boolean;
  tooltip?: string | { value?: string };
  collapsibleState?: 0 | 1 | 2;
  contextValue?: string;
  command?: { command?: string; title?: string; arguments?: unknown[] };
  iconPath?: unknown;
  resourceUri?: { toString(): string };
}

interface TreeViewRecord {
  viewId: string;
  extensionId?: string;
  provider: TreeDataProvider;
  nextNodeId: number;
  nodes: Map<string, TreeNodeRecord>;
}

interface TreeNodeRecord {
  id: string;
  element: unknown;
  item: TreeItemLike;
  dto: HostTreeNodeDto;
}

export class TreeViewRegistry {
  private readonly views = new Map<string, TreeViewRecord>();

  registerTreeView(viewId: string, treeOptions: unknown, extensionId?: string): void {
    const provider = (treeOptions as { treeDataProvider?: TreeDataProvider } | undefined)?.treeDataProvider;
    if (!provider || typeof provider.getChildren !== "function" || typeof provider.getTreeItem !== "function") {
      throw new Error(`Tree view provider is invalid: ${viewId}`);
    }

    this.views.set(viewId, {
      viewId,
      extensionId,
      provider,
      nextNodeId: 1,
      nodes: new Map()
    });
  }

  async resolveChildren(viewId: string, parentNodeId?: string): Promise<ResolveTreeChildrenResponse> {
    const view = this.getView(viewId);
    const parentElement = parentNodeId ? this.getNode(view, parentNodeId).element : undefined;
    const elements = await Promise.resolve(view.provider.getChildren(parentElement));
    const nodes = await Promise.all((elements ?? []).map((element) => this.createNode(view, element)));

    return {
      viewId,
      parentNodeId,
      nodes
    };
  }

  async invokeNodeCommand(viewId: string, nodeId: string, commandRegistry: CommandRegistry): Promise<boolean> {
    const view = this.getView(viewId);
    const node = this.getNode(view, nodeId);
    const command = node.item.command;
    if (!command?.command) {
      throw new Error(`Tree node has no command: ${nodeId}`);
    }

    await commandRegistry.executeCommand(command.command, ...(command.arguments ?? []));
    return true;
  }

  async invokeMenuCommand(
    viewId: string,
    nodeId: string,
    command: string,
    args: unknown[] | undefined,
    commandRegistry: CommandRegistry
  ): Promise<boolean> {
    const view = this.getView(viewId);
    const node = this.getNode(view, nodeId);
    await commandRegistry.executeCommand(command, node.element, ...(args ?? []));
    return true;
  }

  private async createNode(view: TreeViewRecord, element: unknown): Promise<HostTreeNodeDto> {
    const item = await Promise.resolve(view.provider.getTreeItem(element));
    const id = `${view.viewId}:${view.nextNodeId++}`;
    const command = serializeCommand(item.command);
    const dto: HostTreeNodeDto = {
      id,
      label: serializeLabel(item.label, element),
      collapsibleState: item.collapsibleState ?? 0,
      description: serializeDescription(item.description),
      tooltip: serializeTooltip(item.tooltip),
      contextValue: item.contextValue,
      command,
      iconPath: serializeUnknown(item.iconPath),
      resourceUri: item.resourceUri?.toString()
    };

    view.nodes.set(id, { id, element, item, dto });
    return dto;
  }

  private getView(viewId: string): TreeViewRecord {
    const view = this.views.get(viewId);
    if (!view) {
      throw new Error(`Tree view not found: ${viewId}`);
    }
    return view;
  }

  private getNode(view: TreeViewRecord, nodeId: string): TreeNodeRecord {
    const node = view.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Tree node not found: ${nodeId}`);
    }
    return node;
  }
}

function serializeCommand(command: TreeItemLike["command"]): HostTreeCommandDto | undefined {
  if (!command?.command) {
    return undefined;
  }

  return {
    command: command.command,
    title: command.title ?? command.command
  };
}

function serializeLabel(label: TreeItemLike["label"], element: unknown): string {
  if (typeof label === "string") {
    return label;
  }
  if (label && typeof label === "object" && typeof label.label === "string") {
    return label.label;
  }
  if (typeof element === "string") {
    return element;
  }
  return String(element ?? "");
}

function serializeDescription(description: TreeItemLike["description"]): string | undefined {
  return typeof description === "string" ? description : undefined;
}

function serializeTooltip(tooltip: TreeItemLike["tooltip"]): string | undefined {
  if (typeof tooltip === "string") {
    return tooltip;
  }
  if (tooltip && typeof tooltip === "object" && typeof tooltip.value === "string") {
    return tooltip.value;
  }
  return undefined;
}

function serializeUnknown(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
