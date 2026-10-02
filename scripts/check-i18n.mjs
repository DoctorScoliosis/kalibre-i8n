import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateCanonical, validateTranslation, METADATA_FILES } from "./lib/integrity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const localesDir = path.join(rootDir, "locales");

const sha256 = (content) => crypto.createHash("sha256").update(content).digest("hex");

function loadLocale(dir) {
  const files = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    files[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  return files;
}

const errors = [];
const report = [];

// 1. index.json and the packs it lists
const indexPath = path.join(rootDir, "index.json");
if (!fs.existsSync(indexPath)) {
  errors.push("Missing index.json");
} else {
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  if (index.kalibreI18nIndex !== 1) errors.push("index.json missing kalibreI18nIndex: 1");
  for (const item of index.locales || []) {
    const packPath = path.join(rootDir, item.pack);
    if (!fs.existsSync(packPath)) errors.push(`Pack file missing: ${item.pack}`);
    else if (sha256(fs.readFileSync(packPath, "utf8")) !== item.sha256) {
      errors.push(`Pack hash mismatch for ${item.id}: run npm run build`);
    }
  }
}

// 2. en-GB is canonical: empty or malformed entries are errors
const enDir = path.join(localesDir, "en-GB");
if (!fs.existsSync(enDir)) {
  errors.push("Missing reference locale en-GB");
} else {
  const canonical = validateCanonical(loadLocale(enDir));
  errors.push(...canonical.errors);

  // 2b. The en-GB copy here must be the application's own en-GB, when that checkout is beside this one.
  const coreDir = process.env.KALIBRE_CORE_DIR
    ? path.resolve(process.env.KALIBRE_CORE_DIR)
    : path.resolve(rootDir, "../Kalibre-r1");
  const coreEn = path.join(coreDir, "src/locales/en-GB");
  if (fs.existsSync(coreEn)) {
    const core = validateCanonical(loadLocale(coreEn));
    for (const [key, text] of core.messages) {
      if (canonical.messages.get(key) !== text) errors.push(`[en-GB] ${key}: differs from the application's en-GB, run npm run sync`);
    }
    for (const key of canonical.messages.keys()) {
      if (!core.messages.has(key)) errors.push(`[en-GB] ${key}: not in the application's en-GB, run npm run sync`);
    }
    report.push("en-GB matches the application's en-GB");
  } else {
    report.push("application checkout not found (set KALIBRE_CORE_DIR): en-GB drift not checked");
  }

  // 3. Every other locale against en-GB
  const tags = fs.readdirSync(localesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "en-GB")
    .map((d) => d.name);

  for (const tag of tags) {
    const dir = path.join(localesDir, tag);
    const files = loadLocale(dir);
    const meta = files.meta;
    if (!meta) {
      errors.push(`${tag}: missing meta.json`);
      continue;
    }
    if (!meta.id || !meta.name || !meta.englishName) errors.push(`${tag}: meta.json missing required fields (id, name, englishName)`);
    if (meta.id && meta.id !== tag) errors.push(`${tag}: meta.json id “${meta.id}” does not match its folder`);
    if (!Number.isInteger(meta.revision) || meta.revision < 1) errors.push(`${tag}: meta.json revision must be a whole number from 1`);

    const result = validateTranslation(canonical.messages, files, tag);
    errors.push(...result.errors);
    const translated = [...result.messages.keys()].filter((k) => canonical.messages.has(k)).length;
    report.push(`${tag}: ${translated}/${canonical.messages.size} messages translated, the rest fall back to en-GB`);
  }
}

report.forEach((line) => console.log(line));
if (errors.length > 0) {
  console.error(`Check failed with ${errors.length} error(s):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("Check passed: canonical English, orphaned keys, slots, plurals, selects and checksums are valid.");
