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
│   └── check-i18n.mjs        # CI validator: syntax, key parity, ICU placeholders, checksums
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
# Build atomic packs and update index.json with new SHA-256 checksums
npm run build

# Validate JSON syntax, placeholder consistency, and key parity against en-GB
npm run check

# Refresh locales/en-GB from the Kalibre application checkout (../Kalibre-r1, or KALIBRE_CORE_DIR)
npm run sync

# Run full test suite
npm test
```

### What the check enforces

`locales/en-GB/` is a snapshot of the application's canonical English (the application owns it; `npm run sync` refreshes it, and the check fails if the two drift).

- **Hard errors:** an empty or malformed English message; in any other language, a key English doesn't have (an orphan), a malformed message, a missing, added or renamed `{slot}`, a plural or select whose structure differs from English, a plural lacking `other` or a category the language needs.
- **Allowed:** leaving a message untranslated. Kalibre falls back to English for it.
