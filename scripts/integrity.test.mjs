import test from "node:test";
import assert from "node:assert/strict";
import { validateCanonical, validateTranslation, patternProblems, structureProblems } from "./lib/integrity.mjs";

const en = validateCanonical({
  a: {
    plain: "hello {name}",
    count: "{count, plural, one {# test} other {# tests}}",
    who: "{who, select, cal {he} libby {she} other {they}}",
    lines: ["one {x}", "two"],
  },
}).messages;

test("empty or invalid canonical English is an error", () => {
  assert.equal(validateCanonical({ a: { x: "" } }).errors.length, 1);
  assert.equal(validateCanonical({ a: { x: 3 } }).errors.length, 1);
  assert.equal(validateCanonical({ a: { x: ["ok", " "] } }).errors.length, 1);
  assert.ok(patternProblems("hi {name").includes("unbalanced braces"));
  assert.match(patternProblems("{n, plural, one {a}}").join(), /no “other” case/);
  assert.match(patternProblems("{n, plural, other {a}}", "en-GB").join(), /missing the “one” case/);
});

test("missing translations are allowed", () => {
  assert.deepEqual(validateTranslation(en, { a: { plain: "bonjour {name}" } }, "fr-FR").errors, []);
  assert.deepEqual(validateTranslation(en, {}, "fr-FR").errors, []);
});

test("orphaned keys are errors", () => {
  const { errors } = validateTranslation(en, { a: { gone: "x", lines: ["a {x}", "b", "c"] }, b: { z: "q" } }, "fr-FR");
  assert.equal(errors.filter((e) => e.includes("orphaned")).length, 3);
});

test("slot, plural and select mismatches are errors", () => {
  assert.deepEqual(structureProblems("hello {name}", "bonjour"), ["missing slot {name}"]);
  assert.deepEqual(structureProblems("hello {name}", "bonjour {name} {x}"), ["slot {x} is not in English"]);
  assert.match(structureProblems(en.get("a.count"), "{count} tests").join(), /plural in English but a var/);
  assert.match(structureProblems(en.get("a.who"), "{who, select, cal {il} other {iel}}").join(), /select on \{who\}/);
  assert.deepEqual(structureProblems(en.get("a.count"), "{count, plural, one {#} other {#}}"), []);
});

test("plural categories follow the translation's own language", () => {
  assert.match(patternProblems("{n, plural, one {#} other {#}}", "ru-RU").join(), /missing the “few” case/);
  assert.deepEqual(patternProblems("{n, plural, other {# 次}}", "zh-CN"), []);
});

test("translation plurals follow source categories while allowing target-locale categories", () => {
  const source = new Map([["a.count", "{count, plural, one {# test} other {# tests}}"]]);

  assert.deepEqual(
    validateTranslation(source, { a: { count: "{count, plural, one {# prova} other {# prove}}" } }, "it-IT").errors,
    [],
  );

  assert.deepEqual(
    validateTranslation(source, { a: { count: "{count, plural, one {#} few {#} many {#} other {#}}" } }, "ru-RU").errors,
    [],
  );

  assert.match(
    validateTranslation(source, { a: { count: "{count, plural, other {#}}" } }, "it-IT").errors.join(),
    /missing the “one” case the source message uses/,
  );
});
