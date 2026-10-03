import { flattenLocale, validateCanonical } from "./integrity.mjs";

export function analyseCorePr({ baseFiles, currentFiles, canonicalFiles, localeFiles = {} }) {
  const base = validateCanonical(baseFiles);
  const current = validateCanonical(currentFiles);
  const canonical = validateCanonical(canonicalFiles);

  const errors = [
    ...base.errors.map((message) => `[base] ${message}`),
    ...current.errors.map((message) => `[PR] ${message}`),
    ...canonical.errors.map((message) => `[i18n canonical] ${message}`)
  ];

  const added = [...current.messages.keys()]
    .filter((key) => !base.messages.has(key))
    .sort();

  const removed = [...base.messages.keys()]
    .filter((key) => !current.messages.has(key))
    .sort();

  const changed = [...current.messages.keys()]
    .filter((key) => base.messages.has(key) && base.messages.get(key) !== current.messages.get(key))
    .sort();

  const coverage = Object.entries(localeFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, files]) => {
      const { messages } = flattenLocale(files);
      const present = added.filter((key) => messages.has(key));
      const missing = added.filter((key) => !messages.has(key));
      return { tag, present, missing };
    });

  const addedNotYetCanonical = added.filter((key) => !canonical.messages.has(key));
  const removedStillCanonical = removed.filter((key) => canonical.messages.has(key));

  return { errors, added, removed, changed, coverage, addedNotYetCanonical, removedStillCanonical };
}

function bulletList(items) {
  return items.map((item) => `- \`${item}\``).join("\n");
}

export function markdownReport(result) {
  const lines = ["## Localisation impact", ""];

  if (result.errors.length > 0) {
    lines.push("### Validation errors", "", ...result.errors.map((error) => `- ${error}`), "");
    lines.push("> Translation coverage below was still calculated where possible.", "");
  }

  if (result.added.length === 0 && result.removed.length === 0 && result.changed.length === 0) {
    lines.push("No English localisation keys were added, removed, or textually changed by this PR.");
    return lines.join("\n");
  }

  lines.push(`### New English strings (${result.added.length})`, "");
  lines.push(result.added.length === 0 ? "None." : bulletList(result.added), "");

  if (result.added.length > 0) {
    lines.push("### Translation coverage for new strings", "");
    lines.push("| Locale | Present | Missing | Status |");
    lines.push("| --- | ---: | ---: | --- |");
    for (const row of result.coverage) {
      const status = row.missing.length === 0 ? "Complete" : "Needs translation";
      lines.push(`| ${row.tag} | ${row.present.length} | ${row.missing.length} | ${status} |`);
    }
    if (result.coverage.length === 0) lines.push("| — | 0 | 0 | No translation packs found |");
    lines.push("");

    if (result.addedNotYetCanonical.length > 0) {
      lines.push(
        `**${result.addedNotYetCanonical.length} new key(s) are not in the current \`kalibre-i8n\` en-GB snapshot yet.** This is expected until the canonical snapshot is synced.`,
        ""
      );
    }

    for (const row of result.coverage.filter((item) => item.missing.length > 0)) {
      lines.push(`<details><summary>${row.tag}: ${row.missing.length} missing</summary>`, "");
      lines.push(bulletList(row.missing), "", "</details>", "");
    }
  }

  lines.push(`### English strings changed (${result.changed.length})`, "");
  if (result.changed.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push(
      "These keys existed before the PR but their English source text changed; translations may need review.",
      "",
      bulletList(result.changed),
      ""
    );
  }

  lines.push(`### English strings removed (${result.removed.length})`, "");
  if (result.removed.length === 0) {
    lines.push("None.");
  } else {
    lines.push(
      "These keys were present on the base branch but are absent from the PR. They may become orphaned translation entries when the canonical snapshot catches up.",
      "",
      bulletList(result.removed)
    );
  }

  return lines.join("\n");
}
