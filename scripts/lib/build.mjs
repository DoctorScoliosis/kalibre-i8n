import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sha256 = (content) => crypto.createHash("sha256").update(content).digest("hex");

// A locale is published unless its meta.json says `"published": false`. An unpublished locale keeps its
// files here (its partial translation is work to come) but gets no manifest, no pack and no entry in
// index.json, so the application never offers it.
export const isPublished = (meta) => meta?.published !== false;

// Bundles every published locale's modular files into manifest.json, a pack and an index.json entry.
// Only the generated artefacts are written; nothing here is meant to be edited by hand.
export function buildPacks({ rootDir }) {
  const localesDir = path.join(rootDir, "locales");
  const packsDir = path.join(rootDir, "packs");
  fs.mkdirSync(packsDir, { recursive: true });

  const localeDirs = fs.readdirSync(localesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const indexLocales = [];
  const skipped = [];
  const unpublished = [];

  for (const tag of localeDirs) {
    const dir = path.join(localesDir, tag);
    const metaPath = path.join(dir, "meta.json");
    if (!fs.existsSync(metaPath)) {
      skipped.push(tag);
      continue;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (!isPublished(meta)) {
      // Nothing is distributed for it, and anything an earlier build left behind goes.
      fs.rmSync(path.join(dir, "manifest.json"), { force: true });
      fs.rmSync(path.join(packsDir, `${tag}.json`), { force: true });
      unpublished.push(tag);
      continue;
    }
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "meta.json" && f !== "manifest.json")
      .sort();

    const fileChecksums = {};
    const strings = {};

    for (const f of files) {
      const content = fs.readFileSync(path.join(dir, f), "utf8");
      fileChecksums[f] = sha256(content);
      strings[f.replace(/\.json$/, "")] = JSON.parse(content);
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
      sha256: sha256(packContent),
      bytes: fs.statSync(packPath).size
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
  return { built: indexLocales.map((item) => item.id), skipped, unpublished };
}
