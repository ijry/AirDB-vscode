import { createNotification } from "@airdb-standalone/protocol";
import type { ExtensionManifest } from "./manifest.js";
import { getExtensionId } from "./manifest.js";

export interface RegisteredContribution {
  extensionId: string;
  manifest: ExtensionManifest;
}

export interface ContributionSnapshot {
  extensions: RegisteredContribution[];
  context: Record<string, unknown>;
  menus: Record<string, Array<Record<string, unknown>>>;
}

export class ContributionRegistry {
  private readonly contributions: RegisteredContribution[] = [];
  private readonly contextKeys = new Map<string, unknown>();

  register(manifest: ExtensionManifest): RegisteredContribution {
    const contribution = {
      extensionId: getExtensionId(manifest),
      manifest
    };
    this.contributions.push(contribution);
    return contribution;
  }

  all(): RegisteredContribution[] {
    return [...this.contributions];
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
  }

  getContextSnapshot(): Record<string, unknown> {
    return Object.fromEntries(this.contextKeys);
  }

  toPayload(): ContributionSnapshot {
    const context = this.getContextSnapshot();
    const extensions = this.contributions.map((contribution) => ({
      extensionId: contribution.extensionId,
      manifest: filterManifest(contribution.manifest, context)
    }));

    return {
      extensions,
      context,
      menus: collectMenus(extensions)
    };
  }

  toNotification() {
    return createNotification("extension.registerContributions", {
      ...this.toPayload()
    });
  }
}

function filterManifest(manifest: ExtensionManifest, context: Record<string, unknown>): ExtensionManifest {
  const contributes = manifest.contributes;
  if (!contributes?.menus) {
    return manifest;
  }

  return {
    ...manifest,
    contributes: {
      ...contributes,
      menus: Object.fromEntries(
        Object.entries(contributes.menus).map(([location, items]) => [
          location,
          items.filter((item) => isWhenExpressionEnabled(item.when, context))
        ])
      )
    }
  };
}

function collectMenus(extensions: RegisteredContribution[]): Record<string, Array<Record<string, unknown>>> {
  return extensions.reduce<Record<string, Array<Record<string, unknown>>>>((acc, contribution) => {
    const menus = contribution.manifest.contributes?.menus;
    if (!menus) {
      return acc;
    }

    for (const [location, items] of Object.entries(menus)) {
      const bucket = acc[location] ?? [];
      bucket.push(
        ...items.map((item) => ({
          ...item,
          extensionId: contribution.extensionId
        }))
      );
      acc[location] = bucket;
    }

    return acc;
  }, {});
}

function isWhenExpressionEnabled(expression: unknown, context: Record<string, unknown>): boolean {
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
    if (!key) {
      return false;
    }
    return !Boolean(context[key]);
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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
  if (!Number.isNaN(numeric) && value.trim() !== "") {
    return numeric;
  }
  return value;
}
