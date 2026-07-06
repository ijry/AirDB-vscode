import { open, save, type OpenDialogOptions, type SaveDialogOptions } from "@tauri-apps/plugin-dialog";
import {
  createErrorResponse,
  createResponse,
  type HostFileUriDto,
  type HostRequest,
  type HostResponse
} from "@airdb-standalone/protocol";

export interface TauriDialogFilter {
  name: string;
  extensions: string[];
}

export interface NormalizedFileDialogOptions {
  title?: string;
  multiple?: boolean;
  directory?: boolean;
  defaultPath?: string;
  filters?: TauriDialogFilter[];
}

export interface FileDialogTransport {
  open(options: NormalizedFileDialogOptions): Promise<unknown>;
  save(options: NormalizedFileDialogOptions): Promise<unknown>;
}

export function createDefaultFileDialogTransport(): FileDialogTransport {
  return {
    open: (options) => open(options as OpenDialogOptions),
    save: (options) => save(toSaveDialogOptions(options))
  };
}

export async function handleFileDialogRequest(
  request: HostRequest,
  sendResponse: (response: HostResponse) => Promise<void>,
  transport: FileDialogTransport = createDefaultFileDialogTransport()
): Promise<boolean> {
  if (request.kind !== "request" || request.group !== "dialog.showOpenDialog") {
    return false;
  }

  const payload = asRecord(request.payload);
  const options = normalizeFileDialogOptions(payload);

  try {
    if (payload.save === true) {
      const selection = await transport.save(options);
      await sendResponse(createResponse(request, responsePayloadForSaveSelection(selection)));
      return true;
    }

    const selection = await transport.open(options);
    await sendResponse(createResponse(request, responsePayloadForOpenSelection(selection)));
    return true;
  } catch (error) {
    await sendResponse(createErrorResponse(request, error instanceof Error ? error.message : String(error)));
    return true;
  }
}

export function normalizeFileDialogOptions(value: unknown): NormalizedFileDialogOptions {
  const payload = asRecord(value);
  const title = stringValue(payload.title) ?? stringValue(payload.openLabel) ?? stringValue(payload.saveLabel);
  const defaultPath = getDefaultPath(payload.defaultUri);
  const filters = normalizeFilters(payload.filters);
  const options: NormalizedFileDialogOptions = {
    ...(title ? { title } : {}),
    multiple: payload.canSelectMany === true,
    directory: payload.canSelectFolders === true && payload.canSelectFiles !== true,
    ...(defaultPath ? { defaultPath } : {}),
    ...(filters.length > 0 ? { filters } : {})
  };

  return options;
}

export function responsePayloadForOpenSelection(selection: unknown): HostFileUriDto[] | null {
  if (selection == null) {
    return null;
  }
  const paths = Array.isArray(selection) ? selection : [selection];
  const uris = paths
    .filter((path): path is string => typeof path === "string" && path.length > 0)
    .map((fsPath) => ({ scheme: "file" as const, fsPath }));

  return uris.length > 0 ? uris : null;
}

export function responsePayloadForSaveSelection(selection: unknown): HostFileUriDto | null {
  if (typeof selection !== "string" || selection.length === 0) {
    return null;
  }
  return { scheme: "file", fsPath: selection };
}

function normalizeFilters(value: unknown): TauriDialogFilter[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([name, extensions]) => ({
      name,
      extensions: Array.isArray(extensions)
        ? extensions.filter((extension): extension is string => typeof extension === "string" && extension.length > 0)
        : []
    }))
    .filter((filter) => filter.name.length > 0 && filter.extensions.length > 0);
}

function getDefaultPath(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  return stringValue(record.fsPath) ?? stringValue(record.path);
}

function toSaveDialogOptions(options: NormalizedFileDialogOptions): SaveDialogOptions {
  return {
    ...(options.title ? { title: options.title } : {}),
    ...(options.defaultPath ? { defaultPath: options.defaultPath } : {}),
    ...(options.filters ? { filters: options.filters } : {})
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
