# kalibre-i8n

Independent, versioned localisation packs for [Kalibre](https://github.com/DoctorScoliosis/kalibre).

## Why this repository exists

Localisation in Kalibre is decoupled into this repository so that:
1. **No app releases needed for language updates:** Translating a new string or correcting a typo in Chinese, French, or Spanish does not require bumping the core application version or triggering a full app deployment.
2. **Independent language revisions:** Each language pack maintains its own ascending integer `revision` (following the pattern of Kalibre's library datasets). Kalibre polls `index.json` and can update an individual language pack seamlessly.
3. **Translator accessibility:** Translators work with modular, clean JSON files without needing to build the main typing trainer application or navigate its engine code.
4. **100% offline capability:** When selected by a user, Kalibre downloads the language pack from this repository and caches it locally (in IndexedDB/CacheStorage). Once cached, Kalibre remains fully functional offline.

---

## Repository Structure

```
kalibre-i8n/
├── index.json                # Master index of available locales, revisions, and checksums
├── package.json              # Tooling commands (zero runtime dependencies)
├── scripts/
│   ├── build-packs.mjs       # Bundles modular files into single-file packs and updates index.json
│   ├── check-i18n.mjs        # CI validator: syntax, key parity, ICU placeholders, checksums
│   ├── coverage.mjs          # Reports missing/partial translation areas and message counts
│   └── start-translation.mjs # Starts an interactive translation branch and tracks empty locale dirs
├── packs/                    # Atomic, single-fetch packs downloaded by Kalibre
│   ├── en-GB.json
│   └── zh-CN.json
└── locales/                  # Modular source files for translators
    ├── en-GB/                # Reference source locale
    │   ├── meta.json         # Language metadata and review status
    │   ├── chrome.json       # UI navigation, curtain, footer, modals
    │   ├── settings.json     # Settings schema labels, descriptions, and options
    │   ├── achievements.json # Achievement names, groups, and hints
    │   ├── quests.json       # Daily quests and challenge descriptions
    │   ├── themes.json       # Theme editor and picker labels
    │   ├── data.json         # Backup, restore, and storage strings
    │   ├── companions.json   # Companion interactions and reactions
    │   └── about.json        # FAQ and about page information
    └── zh-CN/                # Chinese (Simplified) locale pack
        ├── meta.json
        └── ...
```

---

## Language Metadata (`meta.json`)

Each language folder in `locales/<tag>/` contains a `meta.json`:

```json
{
  "id": "zh-CN",
  "name": "简体中文",
  "englishName": "Chinese (Simplified)",
  "dir": "ltr",
  "fallback": "en-GB",
  "lowercaseDates": false,
  "fonts": ["system-ui", "-apple-system", "PingFang SC", "Microsoft YaHei", "sans-serif"],
  "reviewed": "community",
  "revision": 1,
  "version": "2026-10-02",
  "changes": "Initial Chinese (Simplified) candidate from Qwen with DeepSeek review"
}
```

- **`reviewed`**: `"native"` (reviewed/written by a native speaker), `"community"` (community reviewed), or `"machine"` (machine translated). Kalibre displays an honest, quiet note when a language has not been checked by a native speaker yet.
- **`revision`**: Whole integer (`1, 2, 3...`) that strictly increments on every update. Kalibre uses this to determine when a newer translation is available.

---

## Guidelines for Translators

1. **Tone**: Kalibre's interface is calm, quiet, and friendly. Avoid exclamation-heavy marketing language or nagging tone.
2. **Placeholders**: Keep all `{placeholder}` tokens intact (e.g. `{count}`, `{sessions}`, `{game}`). They are replaced at runtime with dynamic numbers or names.
3. **Reference**: `locales/en-GB/` is the canonical reference. All keys should match between the reference locale and your translation.

---

## Development & Verification

Run validation locally with Node (built and tested on Node 26):

```bash
# Refresh locales/en-GB from the Kalibre application checkout (../Kalibre-r1, or KALIBRE_CORE_DIR)
npm run sync

# Show exactly which JSON areas and messages a locale still needs
npm run coverage -- zh-CN

# Show every non-English locale in one report
npm run coverage

# Emit the same coverage report as JSON for agents/tools
npm run coverage -- zh-CN --json

# Build atomic packs and update index.json with new SHA-256 checksums
npm run build

# Validate JSON syntax, placeholder consistency, and key parity against en-GB
npm run check

# Run full test suite
npm test
```

### Starting a translation branch

`npm run start-translation` opens an interactive arrow-key menu of common locale tags. Choose one with ↑/↓ and Enter, or choose **Enter another BCP 47 language code…** to type any valid language tag supported by the runtime, such as `es-419`, `fr-CA`, or `ja-JP`.

The command:

- requires a clean `main` working tree so a translation branch always starts from a known point;
- creates a branch named `translate/<locale>`;
- creates `locales/<locale>/.gitkeep` immediately, so an empty started translation remains represented in Git;
- commits that placeholder so the branch is visible even before any translation files are added;
- refuses to start a branch when the locale directory or branch already exists.

A locale code may also be supplied directly for automation or scripted hand-offs:

```bash
npm run start-translation -- es-419
```

### Core application PR checks

The repository also exposes a reusable GitHub Actions workflow at `.github/workflows/check-kalibre-pr.yml`. Kalibre's main repository can call it from pull requests to compare the PR's `src/locales/en-GB/` against the PR base and report only the localisation keys introduced by that PR.

The check is intentionally **non-blocking for missing translations**. It fails only for malformed English localisation data or other validation errors. A PR can therefore ship with new English strings while translations are completed independently.

The PR report includes:

- new English localisation keys introduced by the PR;
- per-locale counts of those keys already translated versus missing;
- the exact missing keys for each locale;
- English strings whose source text changed, which may require translation review;
- English keys removed by the PR that may later become orphaned in translation packs.

Local runs can inspect two Kalibre checkouts directly:

```bash
npm run check-core-pr -- \
  --current ../Kalibre-r1/src/locales/en-GB \
  --base ../Kalibre-r1-base/src/locales/en-GB
```

The canonical snapshot and locale directory default to this repository's `locales/en-GB` and `locales/` paths, respectively.

### Translation triage

**Run the coverage report before asking an agent to translate a locale.** It compares the locale directly with the current canonical `en-GB` snapshot and reports:

- missing JSON areas, with the number of source messages in each;
- partially covered areas, with translated and missing message counts;
- orphan keys;
- complete areas.

This avoids spending model/tool compute rediscovering which files are absent. For a focused handoff, paste the output of `npm run coverage -- <locale>` into the translation prompt and tell the agent to work only on the reported gaps.

### What the check enforces

`locales/en-GB/` is a snapshot of the application's canonical English (the application owns it; `npm run sync` refreshes it, and the check fails if the two drift).

- **Hard errors:** an empty or malformed English message; in any other language, a key English doesn't have (an orphan), a malformed message, a missing, added or renamed `{slot}`, a plural or select whose structure differs from English, a plural lacking `other` or a plural category used by the English source; category names must also be valid for the target language.
- **Allowed:** leaving a message untranslated. Kalibre falls back to English for it.
