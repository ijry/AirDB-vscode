# VS Code Entra Publish Design

## Goal

Provide a local release command:

```bash
bash ./publish.sh
```

The command builds, packages, and publishes a new VS Code Marketplace version of `jry.airdb` using Microsoft Entra ID authentication instead of a PAT.

## Scope

The script is for local developer execution only. It does not configure GitHub Actions, service principals, federated credentials, or repository secrets.

## Prerequisites

- `az` is installed and the developer can run `az login`.
- The signed-in Entra identity has permission to publish to the `jry` VS Code Marketplace publisher.
- `nvm`, Node 16.20.2, and Node 20.20.2 are available, matching the existing release workflow.
- npm dependencies can be installed using the npm registry with lockfile registry host replacement.

## Release Flow

1. Verify required tools are available.
2. Verify Azure CLI has an active account, otherwise stop with an `az login` instruction.
3. Read the current `package.json` version and bump the patch version automatically.
4. Add a minimal `CHANGELOG.md` entry for the new version if one does not already exist.
5. Install dependencies with `npm ci --replace-registry-host=always` when `node_modules` is missing.
6. Build with Node 16.
7. Package and publish with Node 20 using `vsce publish --azure-credential`.
8. Keep generated `.vsix` files ignored by git.

## Error Handling

The script fails fast on command errors. It prints actionable messages for missing tools, missing Azure login, unsupported version format, failed build, failed package, and failed publish.

## Files

- `publish.sh`: local release entrypoint.
- `CHANGELOG.md`: release note entry managed by the script.
- `package.json`: patch version managed by the script.
