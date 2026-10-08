import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPacks } from "./lib/build.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { built, skipped, unpublished } = buildPacks({ rootDir });
for (const tag of skipped) console.warn(`Skipping ${tag}: no meta.json`);
if (unpublished.length) console.log(`Not published (meta.json says so): ${unpublished.join(", ")}`);
console.log(`Successfully built ${built.length} packs and updated index.json`);
