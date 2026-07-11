#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

NODE_VERSION="${NODE_VERSION:-20.20.2}"
NODE_BUILD_VERSION="${NODE_BUILD_VERSION:-$NODE_VERSION}"
NODE_PUBLISH_VERSION="${NODE_PUBLISH_VERSION:-$NODE_VERSION}"
DRY_RUN="${PUBLISH_DRY_RUN:-0}"

NODE_RUNNER=""
WIN_ROOT_DIR=""

log() {
  printf '[publish] %s\n' "$*"
}

fail() {
  printf '[publish] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

load_posix_nvm() {
  if command -v nvm >/dev/null 2>&1; then
    return 0
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
  fi
}

to_windows_path() {
  local path="$1"
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$path"
    return 0
  fi

  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$path"
    return 0
  fi

  printf '%s' "$path"
}

ps_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

run_powershell() {
  local script="$1"
  local path_refresh
  path_refresh="\$machinePath = [System.Environment]::GetEnvironmentVariable('Path','Machine'); \$userPath = [System.Environment]::GetEnvironmentVariable('Path','User'); \$env:Path = ((@(\$machinePath, \$userPath) | Where-Object { \$_ }) -join ';')"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${path_refresh}; ${script}"
}

run_node_command() {
  local version="$1"
  shift

  if [ "$NODE_RUNNER" = "posix" ]; then
    nvm use "$version"
    "$@"
    return $?
  fi

  local win_root
  win_root="$(ps_escape "$WIN_ROOT_DIR")"
  local command="$*"
  run_powershell "\$ErrorActionPreference = 'Stop'; Set-Location -LiteralPath '${win_root}'; nvm use ${version}; if (\$LASTEXITCODE -ne 0) { exit \$LASTEXITCODE }; ${command}; exit \$LASTEXITCODE"
}

detect_node_runner() {
  load_posix_nvm

  if command -v nvm >/dev/null 2>&1; then
    NODE_RUNNER="posix"
    return 0
  fi

  if command -v nvm.exe >/dev/null 2>&1 && command -v powershell.exe >/dev/null 2>&1; then
    NODE_RUNNER="windows"
    WIN_ROOT_DIR="$(to_windows_path "$ROOT_DIR")"
    return 0
  fi

  fail "Missing nvm. Install nvm, or on Windows make sure nvm.exe and powershell.exe are available in bash."
}

validate_azure_login() {
  if [ "$NODE_RUNNER" = "posix" ]; then
    command -v az >/dev/null 2>&1 || fail "Missing Azure CLI: az. Install it and run: az login"
    az account show >/dev/null 2>&1 || fail "Azure CLI is not logged in. Run: az login"
    return 0
  fi

  local win_root
  win_root="$(ps_escape "$WIN_ROOT_DIR")"
  if ! run_powershell "\$ErrorActionPreference = 'Stop'; Set-Location -LiteralPath '${win_root}'; if (-not (Get-Command az -ErrorAction SilentlyContinue)) { exit 127 }; az account show *>\$null; exit \$LASTEXITCODE"; then
    fail "Azure CLI is missing or not logged in in Windows. Install Azure CLI, then run: az login"
  fi
}

validate_node_versions() {
  log "Checking Node ${NODE_BUILD_VERSION}"
  run_node_command "$NODE_BUILD_VERSION" node -v >/dev/null

  log "Checking Node ${NODE_PUBLISH_VERSION}"
  run_node_command "$NODE_PUBLISH_VERSION" node -v >/dev/null
}

read_current_version() {
  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n 1
}

bump_package_version() {
  local new_version="$1"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v new_version="$new_version" '
    BEGIN { updated = 0 }
    !updated && /^[[:space:]]*"version":[[:space:]]*"/ {
      sub(/"version":[[:space:]]*"[^"]+"/, "\"version\": \"" new_version "\"")
      updated = 1
    }
    { print }
    END {
      if (!updated) {
        exit 1
      }
    }
  ' package.json > "$tmp_file" || {
    rm -f "$tmp_file"
    fail "Could not update package.json version"
  }

  mv "$tmp_file" package.json
}

add_changelog_entry() {
  local new_version="$1"
  local today="$2"

  if grep -q "^# ${new_version} " CHANGELOG.md; then
    return 0
  fi

  local tmp_file
  tmp_file="$(mktemp)"
  {
    sed -n '1p' CHANGELOG.md
    printf '\n# %s %s\n\n发布新版本\n\n' "$new_version" "$today"
    sed -n '2,$p' CHANGELOG.md
  } > "$tmp_file"
  mv "$tmp_file" CHANGELOG.md
  log "Added CHANGELOG.md entry for ${new_version}"
}

require_cmd sed
require_cmd awk
require_cmd grep
require_cmd date
require_cmd mktemp

detect_node_runner
validate_azure_login
validate_node_versions

current_version="$(read_current_version)"
if [[ ! "$current_version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  fail "Unsupported package.json version '${current_version}'. Expected major.minor.patch."
fi

major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"
new_version="${major}.${minor}.$((patch + 1))"
vsix_file="airdb-${new_version}.vsix"

log "Bumping version: ${current_version} -> ${new_version}"
bump_package_version "$new_version"
add_changelog_entry "$new_version" "$(date +%Y%m%d)"
rm -f "$vsix_file"

if [ ! -d node_modules ]; then
  log "Installing dependencies with Node ${NODE_BUILD_VERSION}"
  run_node_command "$NODE_BUILD_VERSION" npm ci --replace-registry-host=always
fi

log "Building with Node ${NODE_BUILD_VERSION}"
run_node_command "$NODE_BUILD_VERSION" npm run build

log "Packaging with Node ${NODE_PUBLISH_VERSION}"
run_node_command "$NODE_PUBLISH_VERSION" npx --yes @vscode/vsce package --allow-star-activation

if [ ! -f "$vsix_file" ]; then
  fail "Expected package not found: ${vsix_file}"
fi

if [ "$DRY_RUN" = "1" ]; then
  log "Dry run enabled. Skipping publish. Package ready: ${vsix_file}"
  exit 0
fi

log "Publishing ${vsix_file} with Microsoft Entra ID"
run_node_command "$NODE_PUBLISH_VERSION" npx --yes @vscode/vsce publish -i "$vsix_file" --azure-credential --allow-star-activation
log "Published ${vsix_file}"
