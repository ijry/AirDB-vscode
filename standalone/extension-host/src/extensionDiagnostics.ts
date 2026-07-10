import type {
  ExtensionDiagnosticDto,
  ExtensionDiagnosticEventDto,
  ExtensionDiagnosticPhase,
  ExtensionDiagnosticStatus,
  ExtensionDiagnosticsPayload
} from "@airdb-standalone/protocol";
import type { ExtensionManifest } from "./manifest.js";
import { getExtensionId } from "./manifest.js";

const MAX_EVENTS_PER_EXTENSION = 200;

export interface DiagnosticPhaseInput {
  extensionPath: string;
  extensionId?: string;
  phase: ExtensionDiagnosticPhase;
  status: ExtensionDiagnosticStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticFailureInput {
  extensionPath: string;
  extensionId?: string;
  phase: ExtensionDiagnosticPhase;
  message: string;
  error: unknown;
  details?: Record<string, unknown>;
}

export type DiagnosticsEmitter = (payload: ExtensionDiagnosticsPayload) => void;

export class ExtensionDiagnosticsRegistry {
  private readonly extensions = new Map<string, ExtensionDiagnosticDto>();
  private eventSequence = 0;

  constructor(private readonly emit?: DiagnosticsEmitter) {}

  recordDiscovered(extensionPath: string): void {
    this.recordPhase({
      extensionPath,
      phase: "discover",
      status: "discovered",
      message: "Discovered extension directory"
    });
  }

  recordManifest(extensionPath: string, manifest: ExtensionManifest): string {
    const extensionId = getExtensionId(manifest);

    try {
      const extension = this.ensure(extensionPath, extensionId);
      this.extensions.set(extensionId, {
        ...extension,
        ...extractManifestMetadata(manifest),
        id: extensionId,
        extensionPath
      });
      this.recordPhase({
        extensionPath,
        extensionId,
        phase: "manifest",
        status: "loaded",
        message: "Parsed extension manifest"
      });
    } catch {
      return extensionId;
    }

    return extensionId;
  }

  recordPhase(input: DiagnosticPhaseInput): void {
    try {
      const extension = this.ensure(input.extensionPath, input.extensionId);
      const timestamp = new Date().toISOString();
      const event: ExtensionDiagnosticEventDto = {
        id: `diagnostic-${++this.eventSequence}`,
        extensionId: input.extensionId,
        extensionPath: input.extensionPath,
        timestamp,
        phase: input.phase,
        status: input.status,
        message: input.message,
        ...(input.details ? { details: { ...input.details } } : {})
      };
      const next: ExtensionDiagnosticDto = {
        ...extension,
        status: input.status,
        startedAt: extension.startedAt ?? timestamp,
        ...(input.status === "activated" ? { activatedAt: timestamp } : {}),
        ...(typeof input.details?.resolvedMain === "string" ? { resolvedMain: input.details.resolvedMain } : {}),
        events: appendEvent(extension.events, event)
      };
      this.extensions.set(next.id, next);
      this.emitSnapshot();
    } catch {
      return;
    }
  }

  recordFailure(input: DiagnosticFailureInput): void {
    try {
      const error = input.error instanceof Error ? input.error.message : String(input.error);
      const extension = this.ensure(input.extensionPath, input.extensionId);
      const timestamp = new Date().toISOString();
      const event: ExtensionDiagnosticEventDto = {
        id: `diagnostic-${++this.eventSequence}`,
        extensionId: input.extensionId,
        extensionPath: input.extensionPath,
        timestamp,
        phase: input.phase,
        status: "failed",
        message: input.message,
        error,
        ...(input.details ? { details: { ...input.details } } : {})
      };
      this.extensions.set(extension.id, {
        ...extension,
        status: "failed",
        lastError: error,
        startedAt: extension.startedAt ?? timestamp,
        events: appendEvent(extension.events, event)
      });
      this.emitSnapshot();
    } catch {
      return;
    }
  }

  snapshot(): ExtensionDiagnosticsPayload {
    return {
      extensions: Array.from(this.extensions.values()).map(copyExtensionDiagnostic)
    };
  }

  private ensure(extensionPath: string, extensionId?: string): ExtensionDiagnosticDto {
    const key = extensionId ?? extensionPath;
    const existingByKey = this.extensions.get(key);
    if (existingByKey) {
      if (existingByKey.extensionPath === extensionPath) {
        return existingByKey;
      }
      const normalized = { ...existingByKey, extensionPath };
      this.extensions.set(key, normalized);
      return normalized;
    }

    const existingByPath = this.extensions.get(extensionPath);
    if (existingByPath) {
      const normalized = { ...existingByPath, id: key, extensionPath };
      if (key !== extensionPath) {
        this.extensions.delete(extensionPath);
        this.extensions.set(key, normalized);
      }
      return normalized;
    }

    const extension: ExtensionDiagnosticDto = {
      id: key,
      extensionPath,
      commandCount: 0,
      status: "discovered",
      events: []
    };
    this.extensions.set(key, extension);
    return extension;
  }

  private emitSnapshot(): void {
    try {
      this.emit?.(this.snapshot());
    } catch {
      return;
    }
  }
}

function appendEvent(
  events: ExtensionDiagnosticEventDto[],
  event: ExtensionDiagnosticEventDto
): ExtensionDiagnosticEventDto[] {
  return [...events, event].slice(-MAX_EVENTS_PER_EXTENSION);
}

function extractManifestMetadata(manifest: ExtensionManifest): Partial<ExtensionDiagnosticDto> {
  const metadata: Partial<ExtensionDiagnosticDto> = {
    activationEvents: normalizeStringArray((manifest as { activationEvents?: unknown }).activationEvents),
    contributedViews: extractContributedViews(getContributes(manifest)?.views),
    commandCount: countCommands(getContributes(manifest)?.commands)
  };
  const optionalStrings = {
    displayName: (manifest as { displayName?: unknown }).displayName,
    version: (manifest as { version?: unknown }).version,
    publisher: (manifest as { publisher?: unknown }).publisher,
    main: (manifest as { main?: unknown }).main
  };

  for (const [key, value] of Object.entries(optionalStrings)) {
    const sanitized = getOptionalString(value);
    if (sanitized !== undefined) {
      Object.assign(metadata, { [key]: sanitized });
    }
  }

  return metadata;
}

function copyExtensionDiagnostic(extension: ExtensionDiagnosticDto): ExtensionDiagnosticDto {
  return {
    ...extension,
    ...(extension.activationEvents ? { activationEvents: [...extension.activationEvents] } : {}),
    ...(extension.contributedViews ? { contributedViews: [...extension.contributedViews] } : {}),
    events: extension.events.map((event) => ({
      ...event,
      ...(event.details ? { details: { ...event.details } } : {})
    }))
  };
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getContributes(manifest: ExtensionManifest): Record<string, unknown> | undefined {
  const contributes = (manifest as { contributes?: unknown }).contributes;
  return isRecord(contributes) ? contributes : undefined;
}

function countCommands(value: unknown): number {
  return Array.isArray(value)
    ? value.filter((entry) => isRecord(entry) && typeof entry.command === "string").length
    : 0;
}

function extractContributedViews(views: unknown): string[] {
  if (!isRecord(views)) {
    return [];
  }

  return Object.values(views).flatMap((entries) =>
    Array.isArray(entries)
      ? entries
          .map((entry) => isRecord(entry) ? entry.id : undefined)
          .filter((id): id is string => typeof id === "string")
      : []
  );
}
