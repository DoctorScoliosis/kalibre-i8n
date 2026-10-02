import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const localesDir = path.join(rootDir, "locales");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function extractPlaceholders(str) {
  if (typeof str !== "string") return [];
  const matches = str.match(/\{[a-zA-Z0-9_-]+\}/g) || [];
  return matches.map((m) => m.slice(1, -1)).sort();
}

function flattenKeys(obj, prefix = "") {
  let keys = {};
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      Object.assign(keys, flattenKeys(v, full));
    } else {
      keys[full] = v;
    }
  }
  return keys;
}

let errors = [];

// 1. Verify index.json
const indexPath = path.join(rootDir, "index.json");
if (!fs.existsSync(indexPath)) {
  errors.push("Missing index.json");
} else {
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  if (index.kalibreI18nIndex !== 1) errors.push("index.json missing kalibreI18nIndex: 1");
  for (const item of index.locales || []) {
    const packPath = path.join(rootDir, item.pack);
    if (!fs.existsSync(packPath)) {
      errors.push(`Pack file missing: ${item.pack}`);
    } else {
      const content = fs.readFileSync(packPath, "utf8");
      if (sha256(content) !== item.sha256) {
        errors.push(`Pack hash mismatch for ${item.id}`);
      }
    }
  }
}

// 2. Read en-GB as baseline
const enDir = path.join(localesDir, "en-GB");
if (!fs.existsSync(enDir)) {
  errors.push("Missing reference locale en-GB");
} else {
  const enFiles = fs.readdirSync(enDir).filter((f) => f.endsWith(".json") && f !== "meta.json" && f !== "manifest.json");
  const enKeys = {};
  for (const f of enFiles) {
    const area = f.replace(/\.json$/, "");
    const content = JSON.parse(fs.readFileSync(path.join(enDir, f), "utf8"));
    enKeys[area] = flattenKeys(content);
  }

  // Check all other locales against en-GB
  const localeDirs = fs.readdirSync(localesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "en-GB")
    .map((d) => d.name);

  for (const tag of localeDirs) {
    const dir = path.join(localesDir, tag);
    const metaPath = path.join(dir, "meta.json");
    if (!fs.existsSync(metaPath)) {
      errors.push(`${tag}: missing meta.json`);
      continue;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (!meta.id || !meta.name || !meta.englishName) {
      errors.push(`${tag}: meta.json missing required fields (id, name, englishName)`);
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "meta.json" && f !== "manifest.json");
    for (const f of files) {
      const area = f.replace(/\.json$/, "");
      const targetContent = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const targetKeys = flattenKeys(targetContent);
      const refKeys = enKeys[area] || {};

      for (const [k, zhVal] of Object.entries(targetKeys)) {
        if (!(k in refKeys)) {
          errors.push(`${tag}/${area}.json: unexpected key "${k}" not in en-GB`);
        } else {
          const enVal = refKeys[k];
          const enSlots = extractPlaceholders(enVal);
          const zhSlots = extractPlaceholders(zhVal);
          if (JSON.stringify(enSlots) !== JSON.stringify(zhSlots)) {
            errors.push(`${tag}/${area}.json: placeholder mismatch for "${k}": [${enSlots.join(",")}] vs [${zhSlots.join(",")}]`);
          }
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`Check failed with ${errors.length} error(s):\n`, errors.join("\n"));
  process.exit(1);
} else {
  console.log("Check passed: all locales, keys, checksums, and placeholders are valid!");
}
