import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "package.json",
  "tsconfig.base.json",
  "README.md",
  ".gitignore",
  "scripts/check-workspace.mjs"
];

const missing = required.filter((entry) => !existsSync(path.join(root, entry)));

if (missing.length > 0) {
  console.error(`Missing standalone workspace files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Standalone workspace scaffold is present.");
