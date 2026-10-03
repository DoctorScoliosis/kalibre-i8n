import test from "node:test";
import assert from "node:assert/strict";
import { analyseCorePr, markdownReport } from "./lib/core-pr-impact.mjs";

const base = {
  chrome: { old: "Old", changed: "Before" },
  settings: { keep: "Keep" }
};

const current = {
  chrome: { old: "Old", changed: "After", added: "New" },
  settings: { keep: "Keep" }
};

const canonical = {
  chrome: { old: "Old", changed: "Before" },
  settings: { keep: "Keep" }
};

test("detects keys added, removed, and textually changed by the PR", () => {
  const result = analyseCorePr({
    baseFiles: base,
    currentFiles: current,
    canonicalFiles: canonical,
    localeFiles: {}
  });

  assert.deepEqual(result.added, ["chrome.added"]);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.changed, ["chrome.changed"]);
  assert.deepEqual(result.addedNotYetCanonical, ["chrome.added"]);
});

test("reports per-locale coverage for newly added keys", () => {
  const result = analyseCorePr({
    baseFiles: base,
    currentFiles: current,
    canonicalFiles: { ...canonical, chrome: { ...canonical.chrome, added: "New" } },
    localeFiles: {
      "fr-FR": { chrome: { added: "Nouveau" } },
      "de-DE": { chrome: { old: "Alt" } }
    }
  });

  assert.deepEqual(result.coverage, [
    { tag: "de-DE", present: [], missing: ["chrome.added"] },
    { tag: "fr-FR", present: ["chrome.added"], missing: [] }
  ]);
});

test("marks validation errors as failures but does not treat missing translations as errors", () => {
  const result = analyseCorePr({
    baseFiles: base,
    currentFiles: current,
    canonicalFiles: canonical,
    localeFiles: { "fr-FR": {} }
  });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.coverage[0].missing, ["chrome.added"]);
});

test("renders a useful PR summary", () => {
  const result = analyseCorePr({
    baseFiles: base,
    currentFiles: current,
    canonicalFiles: canonical,
    localeFiles: { "fr-FR": { chrome: { added: "Nouveau" } } }
  });
  const markdown = markdownReport(result);
  assert.match(markdown, /New English strings \(1\)/);
  assert.match(markdown, /fr-FR/);
  assert.match(markdown, /English strings changed \(1\)/);
});
