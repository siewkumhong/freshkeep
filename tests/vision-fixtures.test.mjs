import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines the complete 16-case paired-photo accuracy gate", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("fixtures/vision/manifest.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.length, 16);
  assert.equal(manifest.filter((item) => item.kind === "clear").length, 6);
  assert.equal(manifest.filter((item) => item.kind === "unsafe").length, 10);
  for (const item of manifest) {
    assert.match(item.id, /^\d{2}-/);
    if (item.kind === "clear") {
      assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(["expiry", "best_before", "use_by"].includes(item.dateType));
    }
  }
});
