import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const localesDir = path.join(rootDir, "locales");
const packsDir = path.join(rootDir, "packs");

fs.mkdirSync(packsDir, { recursive: true });

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const localeDirs = fs.readdirSync(localesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const indexLocales = [];

for (const tag of localeDirs) {
  const dir = path.join(localesDir, tag);
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) {
    console.warn(`Skipping ${tag}: no meta.json`);
    continue;
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "meta.json" && f !== "manifest.json")
    .sort();

  const fileChecksums = {};
  const strings = {};

  for (const f of files) {
    const filePath = path.join(dir, f);
    const content = fs.readFileSync(filePath, "utf8");
    fileChecksums[f] = sha256(content);
    const area = f.replace(/\.json$/, "");
    strings[area] = JSON.parse(content);
  }

  // Write manifest.json
  const manifest = {
    kalibreLocale: 1,
    ...meta,
    files: fileChecksums
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Write pack
  const packContent = JSON.stringify({ meta, strings }, null, 2) + "\n";
  const packFile = `${tag}.json`;
  const packPath = path.join(packsDir, packFile);
  fs.writeFileSync(packPath, packContent);

  const packHash = sha256(packContent);
  const packStats = fs.statSync(packPath);

  indexLocales.push({
    id: meta.id,
    name: meta.name,
    englishName: meta.englishName,
    dir: meta.dir || "ltr",
    fallback: meta.fallback,
    revision: meta.revision || 1,
    version: meta.version || "1.0.0",
    reviewed: meta.reviewed || "community",
    changes: meta.changes || "",
    path: `locales/${tag}/manifest.json`,
    pack: `packs/${packFile}`,
    sha256: packHash,
    bytes: packStats.size
  });
}

// Write index.json
const index = {
  kalibreI18nIndex: 1,
  repository: {
    name: "kalibre-i8n",
    description: "Independent, versioned localisation packs for Kalibre.",
    url: "https://github.com/DoctorScoliosis/kalibre-i8n"
  },
  locales: indexLocales.sort((a, b) => a.id.localeCompare(b.id))
};

fs.writeFileSync(path.join(rootDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Successfully built ${indexLocales.length} packs and updated index.json`);
