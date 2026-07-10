import { Disposable, EventEmitter, type Event } from "./types.js";
import { unsupported, type UnsupportedApiReporter } from "./unsupported.js";

export interface AuthenticationSessionAccountInformation {
  id: string;
  label: string;
}

export interface AuthenticationSession {
  id: string;
  accessToken: string;
  account: AuthenticationSessionAccountInformation;
  scopes: readonly string[];
}

export interface AuthenticationProviderAuthenticationSessionsChangeEvent {
  added?: readonly AuthenticationSession[];
  removed?: readonly AuthenticationSession[];
  changed?: readonly AuthenticationSession[];
}

export interface AuthenticationSessionsChangeEvent extends AuthenticationProviderAuthenticationSessionsChangeEvent {
  provider: {
    id: string;
    label: string;
  };
}

export interface AuthenticationProvider {
  readonly onDidChangeSessions?: Event<AuthenticationProviderAuthenticationSessionsChangeEvent>;
  getSessions(scopes?: readonly string[]): readonly AuthenticationSession[] | Promise<readonly AuthenticationSession[]>;
  createSession?(scopes: readonly string[]): AuthenticationSession | Promise<AuthenticationSession>;
  removeSession?(sessionId: string): void | Promise<void>;
}

export interface AuthenticationProviderOptions {
  supportsMultipleAccounts?: boolean;
}

export interface AuthenticationGetSessionOptions {
  createIfNone?: boolean | Record<string, unknown>;
  forceNewSession?: boolean | Record<string, unknown>;
  silent?: boolean;
  clearSessionPreference?: boolean;
}

export interface AuthenticationApi {
  readonly onDidChangeSessions: Event<AuthenticationSessionsChangeEvent>;
  registerAuthenticationProvider(
    id: string,
    label: string,
    provider: AuthenticationProvider,
    options?: AuthenticationProviderOptions
  ): Disposable;
  getSession(
    providerId: string,
    scopes: readonly string[],
    options?: AuthenticationGetSessionOptions
  ): Promise<AuthenticationSession | undefined>;
  getAccounts(providerId: string): Promise<AuthenticationSessionAccountInformation[]>;
}

interface AuthenticationProviderEntry {
  id: string;
  label: string;
  provider: AuthenticationProvider;
  options?: AuthenticationProviderOptions;
  providerEventDisposable?: Disposable;
}

export class AuthenticationRegistry {
  private readonly providers = new Map<string, AuthenticationProviderEntry>();
  private readonly changeEmitter = new EventEmitter<AuthenticationSessionsChangeEvent>();
  readonly onDidChangeSessions = this.changeEmitter.event;

  registerAuthenticationProvider(
    id: string,
    label: string,
    provider: AuthenticationProvider,
    options?: AuthenticationProviderOptions
  ): Disposable {
    if (this.providers.has(id)) {
      throw new Error(`Authentication provider already registered: ${id}`);
    }

    const entry: AuthenticationProviderEntry = { id, label, provider, options };
    entry.providerEventDisposable = provider.onDidChangeSessions?.((event) => {
      this.changeEmitter.fire({
        provider: { id, label },
        ...event
      });
    });
    this.providers.set(id, entry);

    return new Disposable(() => {
      entry.providerEventDisposable?.dispose();
      this.providers.delete(id);
    });
  }

  async getSession(
    providerId: string,
    scopes: readonly string[],
    options: AuthenticationGetSessionOptions | undefined,
    reporter?: UnsupportedApiReporter
  ): Promise<AuthenticationSession | undefined> {
    const entry = this.providers.get(providerId);
    if (!entry) {
      if (needsInteractiveSession(options)) {
        return unsupported("authentication.getSession.interactive", reporter);
      }
      return undefined;
    }

    const normalizedScopes = [...scopes];
    if (options?.forceNewSession) {
      return this.createSession(entry, normalizedScopes, "authentication.getSession.forceNewSession", reporter);
    }

    const sessions = await entry.provider.getSessions(normalizedScopes);
    const existing = sessions[0];
    if (existing) {
      return existing;
    }

    if (options?.createIfNone) {
      return this.createSession(entry, normalizedScopes, "authentication.getSession.createIfNone", reporter);
    }

    return undefined;
  }

  async getAccounts(providerId: string): Promise<AuthenticationSessionAccountInformation[]> {
    const entry = this.providers.get(providerId);
    if (!entry) {
      return [];
    }

    const sessions = await entry.provider.getSessions();
    const accounts = new Map<string, AuthenticationSessionAccountInformation>();
    for (const session of sessions) {
      accounts.set(session.account.id, session.account);
    }
    return [...accounts.values()];
  }

  private async createSession(
    entry: AuthenticationProviderEntry,
    scopes: readonly string[],
    apiName: string,
    reporter?: UnsupportedApiReporter
  ): Promise<AuthenticationSession> {
    if (!entry.provider.createSession) {
      return unsupported(apiName, reporter);
    }
    return entry.provider.createSession(scopes);
  }
}

export function createAuthenticationApi(
  registry = new AuthenticationRegistry(),
  reporter?: UnsupportedApiReporter
): AuthenticationApi {
  return {
    onDidChangeSessions: registry.onDidChangeSessions,
    registerAuthenticationProvider(id, label, provider, options) {
      return registry.registerAuthenticationProvider(id, label, provider, options);
    },
    getSession(providerId, scopes, options) {
      return registry.getSession(providerId, scopes, options, reporter);
    },
    getAccounts(providerId) {
      return registry.getAccounts(providerId);
    }
  };
}

function needsInteractiveSession(options: AuthenticationGetSessionOptions | undefined): boolean {
  return Boolean(options?.createIfNone || options?.forceNewSession);
}
