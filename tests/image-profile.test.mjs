import assert from "node:assert/strict";
import test from "node:test";
import {
  EFFICIENT_IMAGE_LIMITS,
  fittedImageDimensions,
  JPEG_QUALITY,
} from "../lib/image-profile.ts";

test("uses role-specific token-efficient image limits", () => {
  assert.deepEqual(EFFICIENT_IMAGE_LIMITS, { item: 1024, date: 1408 });
  assert.equal(JPEG_QUALITY, 0.86);
  assert.deepEqual(fittedImageDimensions(3024, 4032, 1024), {
    width: 768,
    height: 1024,
  });
  assert.deepEqual(fittedImageDimensions(3024, 4032, 1408), {
    width: 1056,
    height: 1408,
  });
});

test("never upscales and rejects invalid dimensions", () => {
  assert.deepEqual(fittedImageDimensions(640, 480, 1024), {
    width: 640,
    height: 480,
  });
  assert.throws(() => fittedImageDimensions(0, 480, 1024));
});
