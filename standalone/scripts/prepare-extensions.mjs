import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(standaloneRoot, "..");
const target = path.join(standaloneRoot, "extensions", "airdb");

const requiredEntries = [
  "package.json",
  "out",
  "resources",
  "syntaxes",
  "l10n"
];

await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });

for (const entry of requiredEntries) {
  const source = path.join(repoRoot, entry);
  const destination = path.join(target, entry);
  await fs.cp(source, destination, { recursive: true });
}

const rootEntries = await fs.readdir(repoRoot);
for (const entry of rootEntries) {
  if (/^package\.nls(?:\..+)?\.json$/.test(entry)) {
    await fs.copyFile(path.join(repoRoot, entry), path.join(target, entry));
  }
}

console.log(`Prepared built-in AirDB extension at ${target}`);
