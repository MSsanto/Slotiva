import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brokenLinks } from "./check-docs.mjs";

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
