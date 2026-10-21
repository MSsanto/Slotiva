import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function requiredUpdates(paths) {
  const required = new Set();
  for (const path of paths) {
    if (/^(worker|migrations)\//.test(path)) {
      required.add("README.md");
      required.add("docs/API.md");
    }
    if (
      /^(src\/|index\.html$|wrangler\.jsonc$|package(?:-lock)?\.json$|tsconfig.*\.json$|vite\.config\.ts$|\.dev\.vars\.example$)/.test(
        path,
      )
    )
      required.add("README.md");
    if (
      /^(worker-tests\/|e2e\/|scripts\/|\.github\/|playwright\.config\.ts$)/.test(
        path,
      )
    )
      required.add("docs/DOCUMENTATION.md");
  }
  return [...required].filter((path) => !paths.includes(path));
}

export function brokenLinks(root, path, content) {
  const errors = [];
  for (const match of content.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    const file = decodeURIComponent(target.split(/[?#]/)[0]);
    if (!file) continue;
    const resolved = resolve(root, dirname(path), file);
    const local = relative(root, resolved);
    if (local.startsWith("../") || !existsSync(resolved))
      errors.push(`${path}: missing or out-of-repository link ${target}`);
  }
  return errors;
}

function main() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  const root = git("rev-parse", "--show-toplevel").trim();
  process.chdir(root);
  const files = git("ls-files", "-z").split("\0").filter(Boolean);
  let base = process.argv[2] || process.env.DOCS_BASE_SHA;
  if (!base || /^0+$/.test(base)) {
    const parents = git("rev-list", "--parents", "-n", "1", "HEAD")
      .trim()
      .split(" ");
    base = parents[1];
    // A new branch push has no previous remote tree: check every tracked file.
    if (process.env.DOCS_BASE_SHA && /^0+$/.test(process.env.DOCS_BASE_SHA))
      base = undefined;
  }
  if (base && !/^[a-f\d]{40,64}$/i.test(base))
    throw new Error("Base must be a full commit SHA.");
  const changed = base
    ? git("diff", "--name-only", "--no-renames", "-z", base, "HEAD")
        .split("\0")
        .filter(Boolean)
    : files;
  const errors = [];
  for (const file of [
    "README.md",
    "docs/API.md",
    "docs/DOCUMENTATION.md",
    "docs/ADR-001-cloudflare.md",
  ])
    if (!existsSync(file)) errors.push(`Missing required document: ${file}`);
  for (const file of files.filter((p) => p.endsWith(".md"))) {
    if (!existsSync(file)) {
      errors.push(`Missing tracked document: ${file}`);
      continue;
    }
    errors.push(...brokenLinks(root, file, readFileSync(file, "utf8")));
  }
  for (const file of requiredUpdates(changed))
    errors.push(`Change range requires update: ${file}`);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Documentation checks passed (${changed.length} changed paths).`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
