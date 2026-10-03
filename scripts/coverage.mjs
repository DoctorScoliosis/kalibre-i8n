import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(rootDir, "locales");

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const localeArg = args.find((arg) => !arg.startsWith("--"));

const contentFiles = (dir) => fs.readdirSync(dir)
  .filter((file) => file.endsWith(".json") && file !== "meta.json" && file !== "manifest.json")
  .sort();

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function leafKeys(value, prefix = "", out = new Set()) {
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && prefix) out.add(prefix);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") out.add(next);
    else if (child && typeof child === "object" && !Array.isArray(child)) leafKeys(child, next, out);
  }
  return out;
}

function analyseLocale(tag, canonicalFiles) {
  const dir = path.join(localesDir, tag);
  const files = contentFiles(dir);
  const fileSet = new Set(files);
  const missingAreas = [];
  const partialAreas = [];
  const completeAreas = [];

  for (const file of canonicalFiles) {
    const canonical = loadJson(path.join(localesDir, "en-GB", file));
    const expected = leafKeys(canonical);
    const translatedFile = path.join(dir, file);

    if (!fileSet.has(file)) {
      missingAreas.push({ file, messages: expected.size });
      continue;
    }

    const translated = leafKeys(loadJson(translatedFile));
    const missingKeys = [...expected].filter((key) => !translated.has(key));
    const orphanKeys = [...translated].filter((key) => !expected.has(key));

    const row = {
      file,
      messages: expected.size,
      translated: expected.size - missingKeys.length,
      missing: missingKeys.length,
      orphans: orphanKeys.length
    };

    if (missingKeys.length > 0 || orphanKeys.length > 0) partialAreas.push(row);
    else completeAreas.push(row);
  }

  const unexpectedFiles = files.filter((file) => !canonicalFiles.includes(file));

  return {
    locale: tag,
    canonicalAreas: canonicalFiles.length,
    presentAreas: canonicalFiles.length - missingAreas.length,
    missingAreas,
    partialAreas,
    completeAreas,
    unexpectedFiles
  };
}

if (!fs.existsSync(localesDir)) {
  console.error("Missing locales directory.");
  process.exit(1);
}

const canonicalDir = path.join(localesDir, "en-GB");
if (!fs.existsSync(canonicalDir)) {
  console.error("Missing locales/en-GB.");
  process.exit(1);
}

const canonicalFiles = contentFiles(canonicalDir);
const tags = localeArg
  ? [localeArg]
  : fs.readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "en-GB")
    .map((entry) => entry.name)
    .sort();

const results = [];
for (const tag of tags) {
  const dir = path.join(localesDir, tag);
  if (!fs.existsSync(dir)) {
    console.error(`Locale not found: ${tag}`);
    process.exitCode = 1;
    continue;
  }
  results.push(analyseLocale(tag, canonicalFiles));
}

if (jsonOutput) {
  console.log(JSON.stringify({ canonicalAreas: canonicalFiles, locales: results }, null, 2));
} else {
  console.log(`Canonical translation areas: ${canonicalFiles.length}`);
  for (const result of results) {
    console.log(`\n${result.locale}: ${result.presentAreas}/${result.canonicalAreas} areas present`);

    if (result.missingAreas.length) {
      console.log("Missing JSON areas:");
      for (const area of result.missingAreas) {
        console.log(`  - ${area.file} (${area.messages} messages)`);
      }
    } else {
      console.log("Missing JSON areas: none");
    }

    if (result.partialAreas.length) {
      console.log("Partially covered areas:");
      for (const area of result.partialAreas) {
        const suffix = area.orphans ? `, ${area.orphans} orphan key${area.orphans === 1 ? "" : "s"}` : "";
        console.log(`  - ${area.file}: ${area.translated}/${area.messages}, ${area.missing} missing${suffix}`);
      }
    }

    console.log(`Complete areas: ${result.completeAreas.length}`);
    if (result.unexpectedFiles.length) {
      console.log(`Unexpected JSON areas: ${result.unexpectedFiles.join(", ")}`);
    }
  }
}
