import fs from "node:fs";
import path from "node:path";

export interface L10nApiOptions {
  extensionPath?: string;
  language?: string;
}

type L10nMessageOptions = {
  message: string;
  args?: unknown[] | Record<string, unknown>;
};

export function createL10nApi(options: L10nApiOptions = {}) {
  const messages = loadL10nMessages(options.extensionPath, options.language);
  return {
    t(value: string | L10nMessageOptions, ...args: unknown[]): string {
      const message = typeof value === "string" ? value : value.message;
      const replacements = typeof value === "string" ? args : value.args ?? [];
      return formatMessage(messages[message] ?? message, replacements);
    }
  };
}

export function loadL10nMessages(extensionPath: string | undefined, language: string | undefined): Record<string, string> {
  if (!extensionPath) {
    return {};
  }

  const l10nDir = path.join(extensionPath, "l10n");
  const messages: Record<string, string> = {};
  for (const filePath of l10nCandidatePaths(l10nDir, language)) {
    Object.assign(messages, readL10nFile(filePath));
  }
  return messages;
}

export function l10nCandidatePaths(l10nDir: string, language: string | undefined): string[] {
  const candidates = ["bundle.l10n.json"];
  const normalizedLanguage = normalizeLanguageForBundle(language);
  if (normalizedLanguage) {
    const baseLanguage = normalizedLanguage.split("-")[0];
    if (baseLanguage && baseLanguage !== normalizedLanguage) {
      candidates.push(`bundle.l10n.${baseLanguage}.json`);
    }
    if (baseLanguage === "zh" && normalizedLanguage !== "zh-cn") {
      candidates.push("bundle.l10n.zh-cn.json");
    }
    candidates.push(`bundle.l10n.${normalizedLanguage}.json`);
  }

  return [...new Set(candidates)].map((candidate) => path.join(l10nDir, candidate));
}

function normalizeLanguageForBundle(language: string | undefined): string | undefined {
  if (!language) {
    return undefined;
  }
  const normalized = language.trim().replace(/_/g, "-").toLowerCase();
  return normalized || undefined;
}

function readL10nFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

function formatMessage(message: string, args: unknown[] | Record<string, unknown>): string {
  if (Array.isArray(args)) {
    return args.reduce<string>(
      (text, arg, index) => text.replace(new RegExp(`\\{${index}\\}`, "g"), String(arg)),
      message
    );
  }

  return Object.entries(args).reduce<string>(
    (text, [key, value]) => text.replace(new RegExp(`\\{${escapeRegExp(key)}\\}`, "g"), String(value)),
    message
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
