import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
  const errors = [];
  for (const file of files.filter((p) => p.endsWith(".md"))) {
    if (!existsSync(file)) {
      errors.push(`Missing tracked document: ${file}`);
      continue;
    }
    errors.push(...brokenLinks(root, file, readFileSync(file, "utf8")));
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Markdown links checked.");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
