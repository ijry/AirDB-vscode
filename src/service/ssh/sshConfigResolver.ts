import { existsSync, readFileSync } from "fs";
import * as vscode from "vscode";
import { SSHConfig } from "@/model/interface/sshConfig";

/**
 * Reads the private key referenced by an SSHConfig.
 *
 * SSHConfig objects are shared by reference across tree nodes, so callers must not
 * cache the key back onto the config: doing so made unrelated code paths depend on
 * whichever path happened to run first.
 *
 * `privateKeyPath` is only honoured when the connection actually uses key auth. The
 * connect form hides the field when switching back to password auth but keeps its
 * value, so a leftover path must not be treated as a key-auth misconfiguration.
 *
 * @throws when key auth is selected but the key is unreadable, so the caller can
 *         surface a real misconfiguration instead of letting ssh2 fail with an
 *         opaque authentication error.
 */
export function resolvePrivateKey(sshConfig: SSHConfig): Buffer | undefined {
    const keyPath = sshConfig.privateKeyPath;
    // Legacy configs predate `type`, where a set path was itself the signal.
    const usesKeyAuth = sshConfig.type ? sshConfig.type === 'privateKey' : true;
    if (!keyPath || !usesKeyAuth) {
        return undefined;
    }
    if (!existsSync(keyPath)) {
        throw new Error(vscode.l10n.t(`Private key file not found: {0}`, keyPath));
    }
    try {
        return readFileSync(keyPath);
    } catch (err) {
        throw new Error(vscode.l10n.t(`Cannot read private key {0}: {1}`, keyPath, err?.message || err));
    }
}

/**
 * Connection options for ssh2, with the private key resolved and a bounded handshake
 * timeout. Without the timeout ssh2 waits out its 20s default with no feedback.
 */
export function buildConnectConfig(sshConfig: SSHConfig): SSHConfig & { readyTimeout: number } {
    const privateKey = resolvePrivateKey(sshConfig);
    return {
        ...sshConfig,
        ...(privateKey ? { privateKey } : {}),
        readyTimeout: 1000 * 10
    };
}
