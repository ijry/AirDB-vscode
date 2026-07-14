import {
  openExternalUri,
  readClipboardText,
  writeClipboardText
} from "./externalActions.js";
import type { HostBridge } from "./window.js";

export function createEnvApi(extensionId: string, bridge: HostBridge, language = resolveUiLanguage()) {
  return {
    language,
    remoteName: undefined,
    openExternal(uri: unknown) {
      return openExternalUri(extensionId, bridge, uri);
    },
    clipboard: {
      writeText(text: unknown) {
        return writeClipboardText(extensionId, bridge, text);
      },
      readText() {
        return readClipboardText(extensionId, bridge);
      }
    }
  };
}

export function resolveUiLanguage(explicitLanguage?: string): string {
  return normalizeUiLanguage(explicitLanguage)
    ?? normalizeUiLanguage(process.env.AIRDB_STANDALONE_LANGUAGE)
    ?? normalizeUiLanguage(resolveVscodeNlsLocale(process.env.VSCODE_NLS_CONFIG))
    ?? normalizeUiLanguage(process.env.LC_ALL)
    ?? normalizeUiLanguage(process.env.LC_MESSAGES)
    ?? normalizeUiLanguage(process.env.LANGUAGE?.split(":")[0])
    ?? normalizeUiLanguage(process.env.LANG)
    ?? normalizeUiLanguage(Intl.DateTimeFormat().resolvedOptions().locale)
    ?? "en";
}

export function normalizeUiLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const withoutEncoding = value.trim().split(".")[0]?.split("@")[0];
  if (!withoutEncoding) {
    return undefined;
  }
  const normalized = withoutEncoding.replace(/_/g, "-").toLowerCase();
  if (!normalized || normalized === "c" || normalized === "posix") {
    return undefined;
  }
  return normalized;
}

function resolveVscodeNlsLocale(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const config = JSON.parse(value) as { locale?: unknown };
    return typeof config.locale === "string" ? config.locale : undefined;
  } catch {
    return undefined;
  }
}
