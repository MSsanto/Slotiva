import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, readdir, lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = path.join(root, ".wrangler", "demo"),
  target = path.join(root, ".wrangler", "restore-drill");
async function sqliteFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink())
      throw Error("Refusing symbolic links in demo storage.");
    if (entry.isDirectory()) files.push(...(await sqliteFiles(full)));
    else if (entry.name.endsWith(".sqlite")) files.push(full);
  }
  return files;
}
const candidates = await sqliteFiles(sourceDir);
const files = candidates.filter((file) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return !!db
      .prepare(
        "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='bookings'",
      )
      .get();
  } finally {
    db.close();
  }
});
if (files.length !== 1)
  throw Error(
    "Expected exactly one isolated demo D1 file. Run npm run demo:init first.",
  );
try {
  if ((await lstat(target)).isSymbolicLink())
    throw Error("Restore directory must not be a symbolic link.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(target, { recursive: true });
const snapshot = path.join(target, "snapshot.sqlite"),
  restored = path.join(target, "restored.sqlite");
await rm(snapshot, { force: true });
await rm(restored, { force: true });
const source = new DatabaseSync(files[0], { readOnly: true });
await backup(source, snapshot);
source.close();
const saved = new DatabaseSync(snapshot, { readOnly: true });
await backup(saved, restored);
saved.close();
const restoredDb = new DatabaseSync(restored, { readOnly: true });
const integrity = restoredDb.prepare("PRAGMA integrity_check").get();
if (Object.values(integrity)[0] !== "ok")
  throw Error("Restore integrity check failed.");
if (restoredDb.prepare("PRAGMA foreign_key_check").all().length)
  throw Error("Restored foreign keys are inconsistent.");
const original = new DatabaseSync(files[0], { readOnly: true });
const tables = original
  .prepare(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all();
for (const { name } of tables) {
  const quoted = '"' + name.replaceAll('"', '""') + '"';
  const before = original
    .prepare(`SELECT count(*) AS n FROM ${quoted}`)
    .get().n;
  const after = restoredDb
    .prepare(`SELECT count(*) AS n FROM ${quoted}`)
    .get().n;
  if (before !== after)
    throw Error(
      `Restored row count differs for ${name}. Stop the demo server and retry.`,
    );
}
const schema =
  "SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name";
if (
  JSON.stringify(original.prepare(schema).all()) !==
  JSON.stringify(restoredDb.prepare(schema).all())
)
  throw Error("Restored schema differs.");
original.close();
restoredDb.close();
console.log(
  `Restore drill passed: integrity, foreign keys, schema and row counts for ${tables.length} tables. Source was not changed.`,
);
