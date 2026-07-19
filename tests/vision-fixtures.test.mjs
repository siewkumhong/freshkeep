import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { EFFICIENT_IMAGE_LIMITS } from "../lib/image-profile.ts";
import { preparedFixtureImages } from "../scripts/vision-fixtures.mjs";

test("generates all 16 synthetic paired fixtures at efficient dimensions", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("./fixtures/vision/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.length, 16);
  assert.equal(manifest.filter((fixture) => fixture.kind === "clear").length, 6);
  assert.equal(manifest.filter((fixture) => fixture.kind === "unsafe").length, 10);

  for (const fixture of manifest) {
    assert.match(fixture.id, /^\d{2}-/);
    assert.ok(fixture.acceptedItemNames.length > 0);
    if (fixture.kind === "clear") {
      assert.match(fixture.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(["expiry", "best_before", "use_by"].includes(fixture.dateType));
    }
  }

  const images = await preparedFixtureImages(manifest[0], EFFICIENT_IMAGE_LIMITS);
  const [item, date] = await Promise.all([
    sharp(images.item).metadata(),
    sharp(images.date).metadata(),
  ]);
  assert.deepEqual([item.width, item.height], [768, 1024]);
  assert.deepEqual([date.width, date.height], [1056, 1408]);
  assert.equal(item.format, "jpeg");
  assert.equal(date.format, "jpeg");
});
