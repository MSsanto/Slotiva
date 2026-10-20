import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requiredUpdates, brokenLinks } from "./check-docs.mjs";

test("backend and migration changes require both contract and entry point", () => {
  assert.deepEqual(requiredUpdates(["worker/index.ts"]), [
    "README.md",
    "docs/API.md",
  ]);
  assert.deepEqual(requiredUpdates(["migrations/0002.sql", "README.md"]), [
    "docs/API.md",
  ]);
  assert.deepEqual(
    requiredUpdates(["worker/types.ts", "README.md", "docs/API.md"]),
    [],
  );
});
test("UI, deployment and verification changes have distinct documentation requirements", () => {
  assert.deepEqual(requiredUpdates(["src/pages/BookingPage.tsx"]), [
    "README.md",
  ]);
  assert.deepEqual(requiredUpdates(["wrangler.jsonc"]), ["README.md"]);
  assert.deepEqual(requiredUpdates([".github/workflows/ci.yml"]), [
    "docs/DOCUMENTATION.md",
  ]);
  assert.deepEqual(
    requiredUpdates(["e2e/booking.spec.ts", "docs/DOCUMENTATION.md"]),
    [],
  );
  assert.deepEqual(requiredUpdates(["docs/API.md"]), []);
});
test("links reject missing files and directory escape while allowing external URLs and anchors", () => {
  const root = mkdtempSync(join(tmpdir(), "slotiva-docs-"));
  try {
    writeFileSync(join(root, "README.md"), "test");
    assert.deepEqual(
      brokenLinks(
        root,
        "README.md",
        "[ok](README.md#x) [web](https://example.com) [anchor](#x)",
      ),
      [],
    );
    assert.equal(brokenLinks(root, "README.md", "[bad](missing.md)").length, 1);
    assert.equal(
      brokenLinks(root, "README.md", "[bad](../outside.md)").length,
      1,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
