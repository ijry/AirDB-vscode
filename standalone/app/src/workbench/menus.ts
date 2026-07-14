import type { MenuContributionState } from "./types";

export interface VisibleMenuItem extends MenuContributionState {
  command: string;
  label: string;
}

export function visibleMenuItems(
  menus: Record<string, MenuContributionState[]>,
  location: string,
  context: Record<string, unknown>
): VisibleMenuItem[] {
  return (menus[location] ?? [])
    .filter((item): item is MenuContributionState & { command: string } => typeof item.command === "string")
    .filter((item) => isWhenExpressionEnabled(item.when, context))
    .map((item) => ({
      ...item,
      label: menuItemLabel(item)
    }));
}

export function isWhenExpressionEnabled(expression: unknown, context: Record<string, unknown>): boolean {
  if (expression === undefined || expression === null || expression === "") {
    return true;
  }
  if (typeof expression !== "string") {
    return false;
  }
  return expression
    .split(/\s*&&\s*/)
    .every((term) => evaluateWhenTerm(term.trim(), context));
}

function evaluateWhenTerm(term: string, context: Record<string, unknown>): boolean {
  if (!term) {
    return true;
  }
  if (term.startsWith("!")) {
    const key = term.slice(1).trim();
    return key ? !Boolean(context[key]) : false;
  }

  const regexMatch = term.match(/^([A-Za-z0-9_.:-]+)\s*=~\s*\/(.+)\/([a-z]*)?$/);
  if (regexMatch) {
    const [, key, pattern, flags] = regexMatch;
    const actual = context[key];
    if (actual === undefined || actual === null) {
      return false;
    }
    try {
      return new RegExp(pattern, flags).test(String(actual));
    } catch {
      return false;
    }
  }

  const equalityMatch = term.match(/^([A-Za-z0-9_.:-]+)\s*(===|==|!==|!=)\s*(.+)$/);
  if (equalityMatch) {
    const [, key, operator, rawValue] = equalityMatch;
    const actual = context[key];
    const expected = parseWhenValue(rawValue.trim());
    return operator === "==" || operator === "===" ? actual === expected : actual !== expected;
  }

  if (!/^[A-Za-z0-9_.:-]+$/.test(term)) {
    return false;
  }
  return Boolean(context[term]);
}

function parseWhenValue(value: string): unknown {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (value === "undefined") {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value !== "") {
    return numeric;
  }
  return value;
}

function menuItemLabel(item: MenuContributionState): string {
  const rawTitle = typeof item.title === "string" ? item.title : undefined;
  if (rawTitle && !isPlaceholder(rawTitle)) {
    return rawTitle;
  }
  if (rawTitle) {
    return humanizePlaceholder(rawTitle);
  }
  return humanizeCommand(String(item.command ?? "Command"));
}

function isPlaceholder(value: string): boolean {
  return value.startsWith("%") && value.endsWith("%");
}

function humanizePlaceholder(value: string): string {
  return humanizeCommand(value.slice(1, -1).replace(/^command\./, ""));
}

function humanizeCommand(value: string): string {
  const meaningful = value.replace(/^airdb\./, "").split(".").filter(Boolean);
  const words = meaningful.length > 0 ? meaningful : [value];
  return words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join(" ");
}
