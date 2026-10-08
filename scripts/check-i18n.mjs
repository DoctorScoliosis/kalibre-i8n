import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkRepository } from "./lib/check.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = process.env.KALIBRE_CORE_DIR
  ? path.resolve(process.env.KALIBRE_CORE_DIR)
  : path.resolve(rootDir, "../Kalibre-r1");

const { errors, report } = checkRepository({ rootDir, coreDir });
report.forEach((line) => console.log(line));
if (errors.length > 0) {
  console.error(`Check failed with ${errors.length} error(s):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("Check passed: canonical English, orphaned keys, slots, plurals, selects and checksums are valid.");
