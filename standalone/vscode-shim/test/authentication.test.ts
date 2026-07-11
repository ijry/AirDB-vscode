import { describe, expect, it } from "vitest";
import type {
  AuthenticationProviderAuthenticationSessionsChangeEvent,
  AuthenticationSession,
  UnsupportedApiEvent
} from "../src";
import {
  AuthenticationRegistry,
  EventEmitter,
  UNSUPPORTED_VSCODE_API_ERROR_CODE,
  UnsupportedApiError,
  createAuthenticationApi
} from "../src";

const session: AuthenticationSession = {
  id: "session-1",
  accessToken: "token-1",
  account: { id: "account-1", label: "Fixture Account" },
  scopes: ["repo"]
};

describe("authentication API", () => {
  it("registers providers and returns provider sessions", async () => {
    const authentication = createAuthenticationApi();

    authentication.registerAuthenticationProvider("fixture-auth", "Fixture Auth", {
      getSessions: () => [session]
    });

    await expect(authentication.getSession("fixture-auth", ["repo"])).resolves.toBe(session);
    await expect(authentication.getAccounts("fixture-auth")).resolves.toEqual([session.account]);
  });

  it("uses provider-created sessions for createIfNone", async () => {
    const authentication = createAuthenticationApi();
    const created: AuthenticationSession = {
      id: "created-session",
      accessToken: "created-token",
      account: { id: "account-2", label: "Created Account" },
      scopes: ["email"]
    };
    let createdScopes: readonly string[] | undefined;

    authentication.registerAuthenticationProvider("fixture-auth", "Fixture Auth", {
      getSessions: () => [],
      createSession: (scopes) => {
        createdScopes = scopes;
        return created;
      }
    });

    await expect(authentication.getSession("fixture-auth", ["email"], { createIfNone: true })).resolves.toBe(created);
    expect(createdScopes).toEqual(["email"]);
  });

  it("rejects duplicate provider registration until disposed", () => {
    const authentication = createAuthenticationApi();
    const provider = { getSessions: () => [] };

    const disposable = authentication.registerAuthenticationProvider("fixture-auth", "Fixture Auth", provider);

    expect(() => authentication.registerAuthenticationProvider("fixture-auth", "Fixture Auth", provider)).toThrow(
      "Authentication provider already registered: fixture-auth"
    );

    disposable.dispose();
    expect(() => authentication.registerAuthenticationProvider("fixture-auth", "Fixture Auth", provider)).not.toThrow();
  });

  it("propagates provider session change events with provider metadata", () => {
    const authentication = createAuthenticationApi();
    const providerEvents = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
    const events: unknown[] = [];

    authentication.onDidChangeSessions((event) => events.push(event));
    authentication.registerAuthenticationProvider("fixture-auth", "Fixture Auth", {
      onDidChangeSessions: providerEvents.event,
      getSessions: () => [session]
    });

    providerEvents.fire({ added: [session] });

    expect(events).toEqual([{
      provider: { id: "fixture-auth", label: "Fixture Auth" },
      added: [session]
    }]);
  });

  it("reports unsupported interactive session creation for missing providers", async () => {
    const events: UnsupportedApiEvent[] = [];
    const authentication = createAuthenticationApi(new AuthenticationRegistry(), (event) => events.push(event));

    await expect(authentication.getSession("missing-auth", [], { createIfNone: true })).rejects.toBeInstanceOf(
      UnsupportedApiError
    );
    expect(events).toEqual([{
      api: "authentication.getSession.interactive",
      code: UNSUPPORTED_VSCODE_API_ERROR_CODE,
      message: "Not implemented in standalone host: authentication.getSession.interactive"
    }]);
  });

  it("reports unsupported forceNewSession when the provider cannot create sessions", async () => {
    const events: UnsupportedApiEvent[] = [];
    const authentication = createAuthenticationApi(new AuthenticationRegistry(), (event) => events.push(event));

    authentication.registerAuthenticationProvider("fixture-auth", "Fixture Auth", {
      getSessions: () => [session]
    });

    await expect(authentication.getSession("fixture-auth", ["repo"], { forceNewSession: true })).rejects.toMatchObject({
      api: "authentication.getSession.forceNewSession",
      code: UNSUPPORTED_VSCODE_API_ERROR_CODE
    });
    expect(events[0]).toMatchObject({
      api: "authentication.getSession.forceNewSession",
      code: UNSUPPORTED_VSCODE_API_ERROR_CODE
    });
  });
});
