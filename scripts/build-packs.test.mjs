import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPacks, isPublished } from "./lib/build.mjs";
import { checkRepository } from "./lib/check.mjs";

// The build and the check, on a throwaway repository: one reference locale, one published translation, one
// unpublished one (its partial work kept, never distributed).

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "i8n-fixture-"));
  const write = (relative, value) => {
    const file = path.join(rootDir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
  };
  const meta = (id, extra = {}) => ({ id, name: id, englishName: id, dir: "ltr", fallback: id === "en-GB" ? null : "en-GB", reviewed: "community", revision: 1, version: "2026-10-08", changes: "x", ...extra });
  write("locales/en-GB/meta.json", meta("en-GB"));
  write("locales/en-GB/common.json", { greeting: { hello: "hello {name}", count: "{count, plural, one {# test} other {# tests}}" } });
  write("locales/xx-XX/meta.json", meta("xx-XX"));
  write("locales/xx-XX/common.json", { greeting: { hello: "bonjour {name}" } });
  write("locales/yy-YY/meta.json", meta("yy-YY", { published: false }));
  write("locales/yy-YY/common.json", { greeting: { hello: "hej {name}" } });
  return { rootDir, write, read: (relative) => fs.readFileSync(path.join(rootDir, relative), "utf8"), exists: (relative) => fs.existsSync(path.join(rootDir, relative)) };
}

test("a locale is published unless its meta says otherwise", () => {
  assert.equal(isPublished({}), true);
  assert.equal(isPublished({ published: true }), true);
  assert.equal(isPublished({ published: false }), false);
});

test("an unpublished locale gets no manifest, no pack and no index entry; the others do", () => {
  const repo = fixture();
  const result = buildPacks({ rootDir: repo.rootDir });
  assert.deepEqual(result.built, ["en-GB", "xx-XX"]);
  assert.deepEqual(result.unpublished, ["yy-YY"]);
  assert.deepEqual(JSON.parse(repo.read("index.json")).locales.map((item) => item.id), ["en-GB", "xx-XX"]);
  assert.ok(repo.exists("packs/en-GB.json") && repo.exists("packs/xx-XX.json"));
  assert.ok(repo.exists("locales/xx-XX/manifest.json"));
  assert.equal(repo.exists("packs/yy-YY.json"), false);
  assert.equal(repo.exists("locales/yy-YY/manifest.json"), false);
  // Its own files are kept exactly as they were.
  assert.ok(repo.exists("locales/yy-YY/common.json") && repo.exists("locales/yy-YY/meta.json"));
});

test("a stale pack or manifest left by an earlier build goes", () => {
  const repo = fixture();
  repo.write("packs/yy-YY.json", "{}\n");
  repo.write("locales/yy-YY/manifest.json", "{}\n");
  buildPacks({ rootDir: repo.rootDir });
  assert.equal(repo.exists("packs/yy-YY.json"), false);
  assert.equal(repo.exists("locales/yy-YY/manifest.json"), false);
});

test("the build is reproducible: building again changes nothing, and published output does not depend on the unpublished locale", () => {
  const repo = fixture();
  buildPacks({ rootDir: repo.rootDir });
  const first = ["index.json", "packs/en-GB.json", "packs/xx-XX.json", "locales/xx-XX/manifest.json"].map((file) => repo.read(file));
  buildPacks({ rootDir: repo.rootDir });
  assert.deepEqual(["index.json", "packs/en-GB.json", "packs/xx-XX.json", "locales/xx-XX/manifest.json"].map((file) => repo.read(file)), first);
  repo.write("locales/yy-YY/common.json", { greeting: { hello: "hej {name}", count: "{count, plural, one {# test} other {# tests}}" } });
  buildPacks({ rootDir: repo.rootDir });
  assert.deepEqual(["index.json", "packs/en-GB.json", "packs/xx-XX.json", "locales/xx-XX/manifest.json"].map((file) => repo.read(file)), first);
});

test("the check passes a built repository, and still validates the unpublished locale's messages", () => {
  const repo = fixture();
  buildPacks({ rootDir: repo.rootDir });
  assert.deepEqual(checkRepository({ rootDir: repo.rootDir }).errors, []);
  repo.write("locales/yy-YY/common.json", { greeting: { hello: "hej", gone: "an orphan" } });
  const { errors } = checkRepository({ rootDir: repo.rootDir });
  assert.ok(errors.some((error) => error.includes("orphaned") && error.includes("yy-YY")), errors.join());
  assert.ok(errors.some((error) => error.includes("missing slot {name}")), errors.join());
});

test("the check fails an unpublished locale that is listed in the index", () => {
  const repo = fixture();
  buildPacks({ rootDir: repo.rootDir });
  const index = JSON.parse(repo.read("index.json"));
  index.locales.push({ ...index.locales[1], id: "yy-YY" });
  repo.write("index.json", index);
  assert.ok(checkRepository({ rootDir: repo.rootDir }).errors.some((error) => error.includes("yy-YY") && error.includes("unpublished") && error.includes("listed in index.json")));
});

test("the check fails a published locale that is missing from the index", () => {
  const repo = fixture();
  buildPacks({ rootDir: repo.rootDir });
  const index = JSON.parse(repo.read("index.json"));
  index.locales = index.locales.filter((item) => item.id !== "xx-XX");
  repo.write("index.json", index);
  assert.ok(checkRepository({ rootDir: repo.rootDir }).errors.some((error) => error.includes("xx-XX") && error.includes("missing from index.json")));
});

test("the check fails a pack whose hash no longer matches, and a published flag that is not a boolean", () => {
  const repo = fixture();
  buildPacks({ rootDir: repo.rootDir });
  repo.write("packs/xx-XX.json", "{}\n");
  assert.ok(checkRepository({ rootDir: repo.rootDir }).errors.some((error) => error.includes("Pack hash mismatch for xx-XX")));
  const other = fixture();
  other.write("locales/yy-YY/meta.json", { id: "yy-YY", name: "yy", englishName: "yy", revision: 1, published: "no" });
  buildPacks({ rootDir: other.rootDir });
  assert.ok(checkRepository({ rootDir: other.rootDir }).errors.some((error) => error.includes("published must be true or false")));
});
