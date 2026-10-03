import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyseCorePr, markdownReport } from "./lib/core-pr-impact.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
}

const currentDir = value("--current", null);
const baseDir = value("--base", null);
const canonicalDir = value("--canonical", path.join(ROOT, "locales", "en-GB"));
const localesRoot = value("--locales", path.join(ROOT, "locales"));

if (!currentDir || !baseDir) {
  console.error("Usage: node scripts/check-core-pr.mjs --current <PR en-GB dir> --base <base en-GB dir> [--canonical <i18n en-GB dir>] [--locales <i18n locales dir>]");
  process.exit(2);
}

function loadLocale(dir) {
  if (!fs.existsSync(dir)) throw new Error(`Locale directory not found: ${dir}`);
  const files = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const name = entry.name.replace(/\.json$/, "");
    files[name] = JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8"));
  }
  return files;
}

function loadLocales(root) {
  if (!fs.existsSync(root)) return {};
  const locales = {};
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "en-GB") continue;
    locales[entry.name] = loadLocale(path.join(root, entry.name));
  }
  return locales;
}

let result;
try {
  result = analyseCorePr({
    baseFiles: loadLocale(baseDir),
    currentFiles: loadLocale(currentDir),
    canonicalFiles: loadLocale(canonicalDir),
    localeFiles: loadLocales(localesRoot)
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(markdownReport(result));
if (result.errors.length > 0) process.exitCode = 1;
