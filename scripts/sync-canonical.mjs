// Copies the application's en-GB into locales/en-GB so translators work from the current source.
// The application (Kalibre) owns en-GB; this copy is a snapshot that `npm run check` keeps honest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = process.env.KALIBRE_CORE_DIR ? path.resolve(process.env.KALIBRE_CORE_DIR) : path.resolve(rootDir, "../Kalibre-r1");
const from = path.join(coreDir, "src/locales/en-GB");
const to = path.join(rootDir, "locales/en-GB");

if (!fs.existsSync(from)) {
  console.error(`Cannot find ${from}. Set KALIBRE_CORE_DIR to a Kalibre checkout.`);
  process.exit(1);
}
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(to)) if (f.endsWith(".json") && f !== "meta.json" && f !== "manifest.json") fs.rmSync(path.join(to, f));
for (const f of fs.readdirSync(from)) {
  if (f.endsWith(".json") && f !== "meta.json") fs.copyFileSync(path.join(from, f), path.join(to, f));
}
console.log("Copied en-GB from the application. Run npm run build to refresh its pack.");
