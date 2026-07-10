import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const standaloneRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultExtensionsDir = path.join(standaloneRoot, "extensions");
const expectedExtensionNames = ["airdb"];
const allowedFiles = new Set([".gitkeep"]);
const requiredAirDbEntries = [
  "package.json",
  "out/extension.js",
  "resources",
  "syntaxes",
  "l10n"
];

export async function checkPreparedExtensions({ extensionsDir = defaultExtensionsDir } = {}) {
  const entries = await fs.readdir(extensionsDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const unexpectedFiles = entries
    .filter((entry) => entry.isFile() && !allowedFiles.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const unsupportedEntries = entries
    .filter((entry) => !entry.isDirectory() && !entry.isFile())
    .map((entry) => entry.name)
    .sort();

  assertSameList(directories, expectedExtensionNames, "Prepared standalone extensions must contain only AirDB");

  if (unexpectedFiles.length > 0) {
    throw new Error(`Unexpected file(s) in standalone/extensions: ${unexpectedFiles.join(", ")}`);
  }
  if (unsupportedEntries.length > 0) {
    throw new Error(`Unsupported entry type(s) in standalone/extensions: ${unsupportedEntries.join(", ")}`);
  }

  const airdbDir = path.join(extensionsDir, "airdb");
  for (const entry of requiredAirDbEntries) {
    try {
      await fs.access(path.join(airdbDir, entry));
    } catch {
      throw new Error(`Missing required AirDB extension entry: ${entry}`);
    }
  }

  const manifest = JSON.parse(await fs.readFile(path.join(airdbDir, "package.json"), "utf8"));
  if (manifest.name !== "airdb" || manifest.publisher !== "jry") {
    throw new Error(`Unexpected AirDB extension identity: ${manifest.publisher}.${manifest.name}`);
  }

  console.log("Prepared standalone extension set contains only AirDB.");
}

if (isCliEntryPoint()) {
  try {
    await checkPreparedExtensions({
      extensionsDir: process.env.AIRDB_STANDALONE_EXTENSIONS ?? defaultExtensionsDir
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function assertSameList(actual, expected, message) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${message}. Actual: ${actual.join(", ") || "(none)"}`);
  }
}

function isCliEntryPoint() {
  return process.argv[1] ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href : false;
}
