// Strict integrity rules for Kalibre locale payloads (kept in step with
// Kalibre-r1/src/scripts/i18n/integrity.js, which holds the runtime's own copy).
//
//   - en-GB is the canonical source.
//   - Empty or malformed canonical entries are errors.
//   - A translation may not contain keys that en-GB lacks (orphans are errors).
//   - A translation's slots, plurals and selects must match the English message.
//   - A translation may leave messages out: Kalibre falls back to English for them.
//
// Zero dependencies, so it runs anywhere `node` does.

export const METADATA_FILES = new Set(["meta", "manifest"]);

/** { area: json } → { messages: Map<'area.path.key', string>, problems } */
export function flattenLocale(files) {
  const messages = new Map();
  const problems = [];
  const walk = (value, key) => {
    if (typeof value === "string") messages.set(key, value);
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${key}.${i}`));
    else if (value && typeof value === "object") {
      for (const [name, child] of Object.entries(value)) {
        if (name !== "_notes") walk(child, `${key}.${name}`);
      }
    } else {
      problems.push({ key, message: `a message must be text, found ${value === null ? "null" : typeof value}` });
    }
  };
  for (const [area, json] of Object.entries(files)) {
    if (!METADATA_FILES.has(area)) walk(json, area);
  }
  return { messages, problems };
}

function balanced(text) {
  let depth = 0;
  for (const ch of text) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

/** Finds the matching "}" for the "{" at `start`; returns its index. */
function closeOf(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

function splitTop(text) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    else if (text[i] === "," && depth === 0 && parts.length < 2) {
      parts.push(text.slice(from, i).trim());
      from = i + 1;
    }
  }
  parts.push(text.slice(from).trim());
  return parts;
}

function parseCases(text) {
  const cases = {};
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    const keyStart = i;
    while (i < text.length && !/\s/.test(text[i]) && text[i] !== "{") i++;
    const key = text.slice(keyStart, i);
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== "{") break;
    const end = closeOf(text, i);
    if (end === -1) break;
    if (key) cases[key] = text.slice(i + 1, end);
    i = end + 1;
  }
  return cases;
}

/** Every slot in a message: [{ name, kind: 'var'|'plural'|'select', cases? }], recursing into branches. */
export function nodesOf(pattern) {
  const nodes = [];
  const visit = (text) => {
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== "{") continue;
      const end = closeOf(text, i);
      if (end === -1) return;
      const parts = splitTop(text.slice(i + 1, end));
      const kind = parts[1]?.toLowerCase();
      if (parts.length >= 3 && (kind === "plural" || kind === "select")) {
        const cases = parseCases(parts[2]);
        nodes.push({ name: parts[0], kind, cases });
        for (const branch of Object.values(cases)) visit(branch);
      } else {
        nodes.push({ name: parts[0], kind: "var" });
      }
      i = end;
    }
  };
  visit(pattern);
  return nodes;
}

export function slotsOf(pattern) {
  const slots = new Map();
  for (const node of nodesOf(pattern)) {
    if (node.kind !== "var" || !slots.has(node.name)) slots.set(node.name, node.kind);
  }
  return slots;
}

export function patternProblems(pattern, locale = "en-GB", requiredPluralCategoriesByName = null) {
  if (typeof pattern !== "string" || pattern.trim() === "") return ["message is empty"];
  if (!balanced(pattern)) return ["unbalanced braces"];
  const problems = [];
  const categories = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  for (const node of nodesOf(pattern)) {
    if (!/^[\w-]+$/.test(node.name)) problems.push(`slot name “${node.name}” is not valid`);
    if (node.kind === "var") continue;
    const names = Object.keys(node.cases);
    if (names.length === 0) problems.push(`${node.kind} on {${node.name}} has no cases`);
    if (!names.includes("other")) problems.push(`${node.kind} on {${node.name}} has no “other” case`);
    if (node.kind === "plural") {
      for (const name of names) {
        if (!/^=\d+$/.test(name) && !categories.has(name)) {
          problems.push(`plural on {${node.name}}: “${name}” is not a plural category of ${locale}`);
        }
      }
      const required = requiredPluralCategoriesByName?.get(node.name) ?? categories;
      for (const needed of required) {
        if (!names.includes(needed)) problems.push(`plural on {${node.name}}: missing the “${needed}” case the source message uses`);
      }
    }
  }
  return problems;
}

export function structureProblems(source, translated) {
  const problems = [];
  const want = slotsOf(source);
  const have = slotsOf(translated);
  for (const [name, kind] of want) {
    if (!have.has(name)) problems.push(`missing slot {${name}}`);
    else if (have.get(name) !== kind) problems.push(`{${name}} is a ${kind} in English but a ${have.get(name)} here`);
  }
  for (const name of have.keys()) {
    if (!want.has(name)) problems.push(`slot {${name}} is not in English`);
  }
  const selects = new Map(nodesOf(source).filter((n) => n.kind === "select").map((n) => [n.name, n]));
  for (const node of nodesOf(translated)) {
    const original = selects.get(node.name);
    if (node.kind !== "select" || !original) continue;
    const a = Object.keys(original.cases).sort().join(",");
    const b = Object.keys(node.cases).sort().join(",");
    if (a !== b) problems.push(`select on {${node.name}} has cases [${b}] but English has [${a}]`);
  }
  return problems;
}

export function validateCanonical(files, locale = "en-GB") {
  const { messages, problems } = flattenLocale(files);
  const errors = problems.map((p) => `[${locale}] ${p.key}: ${p.message}`);
  for (const [key, text] of messages) {
    for (const problem of patternProblems(text, locale)) errors.push(`[${locale}] ${key}: ${problem}`);
  }
  return { errors, messages };
}

function requiredPluralCategoriesByName(pattern, locale) {
  const required = new Map();
  const targetCategories = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  for (const node of nodesOf(pattern)) {
    if (node.kind !== "plural") continue;
    required.set(
      node.name,
      new Set(Object.keys(node.cases).filter((name) => !/^=\d+$/.test(name) && targetCategories.has(name))),
    );
  }
  return required;
}

export function validateTranslation(canonical, files, locale) {
  const { messages, problems } = flattenLocale(files);
  const errors = problems.map((p) => `[${locale}] ${p.key}: ${p.message}`);
  for (const [key, text] of messages) {
    if (!canonical.has(key)) {
      errors.push(`[${locale}] ${key}: orphaned key, English has no such message`);
      continue;
    }
    const source = canonical.get(key);
    for (const problem of patternProblems(text, locale, requiredPluralCategoriesByName(source, locale))) errors.push(`[${locale}] ${key}: ${problem}`);
    for (const problem of structureProblems(source, text)) errors.push(`[${locale}] ${key}: ${problem}`);
  }
  return { errors, messages };
}
