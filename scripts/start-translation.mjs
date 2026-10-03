import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(rootDir, "locales");

const SUGGESTED_LOCALES = [
  "ar", "de-DE", "es-419", "es-ES", "fr-CA", "it-IT",
  "ja-JP", "ko-KR", "nl-NL", "pl-PL", "pt-BR", "pt-PT",
  "ru-RU", "tr-TR", "uk-UA", "vi-VN", "zh-TW"
];

function git(args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8" }).trim();
}

function localeName(code) {
  try {
    return new Intl.DisplayNames(["en-GB"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

function canonicalLocale(input) {
  try {
    const result = Intl.getCanonicalLocales(input.trim());
    if (result.length !== 1) return null;
    const canonical = result[0];
    if (!canonical || canonical.includes("/") || canonical.includes("\\\\") || canonical.includes("..")) {
      return null;
    }
    return canonical;
  } catch {
    return null;
  }
}

function renderMenu(items, selected) {
  process.stdout.write("\x1b[2J\x1b[H");
  console.log("Start a Kalibre translation branch");
  console.log("");
  console.log("Use ↑ ↓ to choose, Enter to start, Esc to cancel.");
  console.log("");

  items.forEach((item, index) => {
    const marker = index === selected ? "›" : " ";
    console.log(marker + " " + item.label);
  });
}

async function choose(items) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive translation setup needs a TTY. Pass a locale code directly instead.");
  }

  return new Promise((resolve, reject) => {
    let selected = 0;

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\x1b[?25h");
    };

    const finish = (value) => {
      cleanup();
      resolve(value);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const onData = (chunk) => {
      const key = chunk.toString();

      if (key === "\u001b") {
        cancel();
        return;
      }
      if (key === "\r" || key === "\n") {
        finish(items[selected]);
        return;
      }
      if (key === "\u0003") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }
      if (key === "\u001b[A" || key === "k") {
        selected = (selected - 1 + items.length) % items.length;
        renderMenu(items, selected);
        return;
      }
      if (key === "\u001b[B" || key === "j") {
        selected = (selected + 1) % items.length;
        renderMenu(items, selected);
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    process.stdout.write("\x1b[?25l");
    renderMenu(items, selected);
  });
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

function ensureCleanMain() {
  const branch = git(["branch", "--show-current"]);
  if (branch !== "main") {
    throw new Error("Start translation branches from main; current branch is " + (branch || "(detached HEAD)") + ".");
  }

  if (git(["status", "--porcelain"])) {
    throw new Error("Working tree is not clean. Commit or stash your changes before starting a translation branch.");
  }
}

function ensureNewLocale(code) {
  const localeDir = path.join(localesDir, code);
  if (fs.existsSync(localeDir)) {
    throw new Error("Locale directory already exists: locales/" + code + ". Use that locale's existing work instead of starting another one.");
  }
}

function ensureNewBranch(branchName) {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/" + branchName], { cwd: rootDir });
    throw new Error("Branch already exists locally: " + branchName);
  } catch (error) {
    if (error?.status !== 1) throw error;
  }

  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", "refs/remotes/origin/" + branchName], { cwd: rootDir });
    throw new Error("Branch already exists on origin: " + branchName);
  } catch (error) {
    if (error?.status !== 1) throw error;
  }
}

async function main() {
  ensureCleanMain();

  const suggested = SUGGESTED_LOCALES
    .filter((code) => !fs.existsSync(path.join(localesDir, code)))
    .map((code) => ({ code, label: code + " — " + localeName(code) }));

  const items = [
    ...suggested,
    { code: "__custom__", label: "Enter another BCP 47 language code…" },
    { code: "__cancel__", label: "Cancel" }
  ];

  const direct = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  let selected = direct ? { code: direct } : await choose(items);

  if (!selected || selected.code === "__cancel__") {
    console.log("Cancelled.");
    return;
  }

  if (selected.code === "__custom__") {
    const raw = await ask("Language code (for example es-419, fr-CA, or ja-JP): ");
    selected = { code: raw };
  }

  const locale = canonicalLocale(selected.code);
  if (!locale) throw new Error("Not a valid BCP 47 language tag: " + selected.code);

  ensureNewLocale(locale);
  const branchName = "translate/" + locale;
  ensureNewBranch(branchName);

  console.log("\\nStarting " + branchName + " (" + localeName(locale) + ").");
  execFileSync("git", ["switch", "-c", branchName], { cwd: rootDir, stdio: "inherit" });

  const localeDir = path.join(localesDir, locale);
  fs.mkdirSync(localeDir, { recursive: true });
  fs.writeFileSync(path.join(localeDir, ".gitkeep"), "");

  execFileSync("git", ["add", path.relative(rootDir, path.join(localeDir, ".gitkeep"))], { cwd: rootDir, stdio: "inherit" });
  execFileSync("git", ["commit", "-m", "[i18n] Start " + locale + " translation branch"], { cwd: rootDir, stdio: "inherit" });

  console.log("\\nTranslation branch ready: " + branchName);
  console.log("Placeholder committed: locales/" + locale + "/.gitkeep");
  console.log("The branch is ready for translation work.");
}

main().catch((error) => {
  console.error("\\nTranslation branch setup failed: " + error.message);
  process.exit(1);
});
