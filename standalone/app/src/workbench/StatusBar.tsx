import type { StatusBarItemState } from "./types";

interface StatusBarProps {
  items: StatusBarItemState[];
  onExecuteCommand(item: StatusBarItemState): void;
}

export function StatusBar({ items, onExecuteCommand }: StatusBarProps) {
  const visibleItems = items.filter((item) => item.visible);
  if (visibleItems.length === 0) {
    return null;
  }

  const left = sortStatusItems(visibleItems.filter((item) => item.alignment !== 2));
  const right = sortStatusItems(visibleItems.filter((item) => item.alignment === 2));

  return (
    <footer className="status-bar">
      <div className="status-bar-group">
        {left.map((item) => <StatusBarButton key={item.id} item={item} onExecuteCommand={onExecuteCommand} />)}
      </div>
      <div className="status-bar-group right">
        {right.map((item) => <StatusBarButton key={item.id} item={item} onExecuteCommand={onExecuteCommand} />)}
      </div>
    </footer>
  );
}

function StatusBarButton({ item, onExecuteCommand }: {
  item: StatusBarItemState;
  onExecuteCommand(item: StatusBarItemState): void;
}) {
  return (
    <button
      type="button"
      className="status-bar-item"
      title={item.tooltip}
      onClick={() => onExecuteCommand(item)}
    >
      {item.text}
    </button>
  );
}

function sortStatusItems(items: StatusBarItemState[]): StatusBarItemState[] {
  return [...items].sort((a, b) => {
    const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0);
    return priorityDelta === 0 ? a.order - b.order : priorityDelta;
  });
}
