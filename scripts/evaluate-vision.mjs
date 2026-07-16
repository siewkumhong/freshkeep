import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  analyzeVisionImages,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from "../lib/vision.ts";

const root = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(root, "tests/fixtures/vision");
const manifest = JSON.parse(
  await readFile(resolve(fixtureRoot, "manifest.json"), "utf8"),
);
const providers = [
  {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
  },
  {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
  },
];

if (providers.some((provider) => !provider.apiKey)) {
  throw new Error("Set both OPENAI_API_KEY and OPENROUTER_API_KEY before running the live accuracy gate.");
}

let failures = 0;
for (const provider of providers) {
  for (const fixture of manifest) {
    try {
      const itemImage = await dataUrl(resolve(fixtureRoot, fixture.id, "item.jpg"));
      const dateImage = await dataUrl(resolve(fixtureRoot, fixture.id, "date.jpg"));
      const result = await analyzeVisionImages(provider, itemImage, dateImage);
      const passed =
        fixture.kind === "clear"
          ? result.date === fixture.date && result.dateType === fixture.dateType
          : result.date === null && result.dateStatus !== "confident";
      if (!passed) failures += 1;
      console.log(
        JSON.stringify({
          provider: provider.provider,
          model: provider.model,
          fixture: fixture.id,
          outcome: passed ? "pass" : "fail",
        }),
      );
    } catch {
      failures += 1;
      console.log(
        JSON.stringify({
          provider: provider.provider,
          model: provider.model,
          fixture: fixture.id,
          outcome: "fail",
        }),
      );
    }
  }
}

if (failures) {
  throw new Error(`${failures} provider/fixture checks failed; keep VISION_PROVIDER=openai.`);
}

async function dataUrl(path) {
  const mime = extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
}
