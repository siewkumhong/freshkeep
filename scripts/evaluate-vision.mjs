import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  analyzeVisionImagesWithUsage,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
} from "../lib/vision.ts";
import {
  BASELINE_IMAGE_LIMITS,
  EFFICIENT_IMAGE_LIMITS,
} from "../lib/image-profile.ts";
import { imageDataUrl, preparedFixtureImages } from "./vision-fixtures.mjs";

const root = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(root, "tests/fixtures/vision");
const completeManifest = JSON.parse(
  await readFile(resolve(fixtureRoot, "manifest.json"), "utf8"),
);
const requestedFixtureIds = new Set(
  (process.env.VISION_EVAL_FIXTURES || "").split(",").filter(Boolean),
);
const manifest = requestedFixtureIds.size
  ? completeManifest.filter((fixture) => requestedFixtureIds.has(fixture.id))
  : completeManifest;
const requestedProviders = new Set(
  (process.env.VISION_EVAL_PROVIDERS || "openai,openrouter")
    .split(",")
    .filter(Boolean),
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
].filter((provider) => requestedProviders.has(provider.provider));

if (
  manifest.length === 0 ||
  providers.length === 0 ||
  providers.some((provider) => !provider.apiKey)
) {
  throw new Error(
    "Set both OPENAI_API_KEY and OPENROUTER_API_KEY before running the live accuracy gate.",
  );
}

let failures = 0;
for (const provider of providers) {
  let optimizedCanonicalTokens;
  for (const fixture of manifest) {
    try {
      const images = await preparedFixtureImages(fixture, EFFICIENT_IMAGE_LIMITS);
      const analysis = await analyzeVisionImagesWithUsage(
        provider,
        imageDataUrl(images.item),
        imageDataUrl(images.date),
      );
      const result = analysis.result;
      const datePassed =
        fixture.kind === "clear"
          ? result.date === fixture.date && result.dateType === fixture.dateType
          : result.date === null && result.dateStatus !== "confident";
      const itemPassed = fixture.acceptedItemNames.includes(
        normalizeName(result.itemName),
      );
      const passed = datePassed && itemPassed;
      if (!passed) failures += 1;
      if (fixture.id === completeManifest[2].id) {
        optimizedCanonicalTokens = analysis.usage.inputTokens;
      }
      log(provider, fixture.id, passed ? "pass" : "fail", analysis.usage, {
        itemOutcome: itemPassed ? "pass" : "fail",
        dateOutcome: datePassed ? "pass" : "fail",
        ...(fixture.kind === "clear"
          ? {
              dateValueOutcome: result.date === fixture.date ? "pass" : "fail",
              dateTypeOutcome:
                result.dateType === fixture.dateType ? "pass" : "fail",
              dateStatusOutcome:
                result.dateStatus === "confident" ? "pass" : "fail",
            }
          : {}),
      });
    } catch (error) {
      failures += 1;
      log(provider, fixture.id, "fail", {}, {
        errorType: error instanceof Error ? error.constructor.name : "UnknownError",
      });
    }
  }

  if (requestedFixtureIds.size === 0) {
    try {
      const fixture = completeManifest[2];
      const images = await preparedFixtureImages(fixture, BASELINE_IMAGE_LIMITS);
      const baseline = await analyzeVisionImagesWithUsage(
        provider,
        imageDataUrl(images.item),
        imageDataUrl(images.date),
      );
      const baselineTokens = baseline.usage.inputTokens;
      const reduction = tokenReduction(baselineTokens, optimizedCanonicalTokens);
      const tokenPassed =
        provider.provider === "openai" ? reduction >= 0.2 : reduction >= 0;
      if (!tokenPassed) failures += 1;
      console.log(
        JSON.stringify({
          provider: provider.provider,
          model: provider.model,
          fixture: fixture.id,
          profile: "baseline-comparison",
          outcome: tokenPassed ? "pass" : "fail",
          inputTokenReduction: Number.isFinite(reduction)
            ? Number(reduction.toFixed(4))
            : null,
        }),
      );
    } catch {
      failures += 1;
      console.log(
        JSON.stringify({
          provider: provider.provider,
          model: provider.model,
          profile: "baseline-comparison",
          outcome: "fail",
        }),
      );
    }
  }
}

if (failures) {
  throw new Error(
    `${failures} accuracy or efficiency checks failed; keep the current production image limits.`,
  );
}

function normalizeName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenReduction(baseline, optimized) {
  if (
    typeof baseline !== "number" ||
    typeof optimized !== "number" ||
    baseline <= 0
  ) {
    return Number.NaN;
  }
  return (baseline - optimized) / baseline;
}

function log(provider, fixture, outcome, usage = {}, diagnostics = {}) {
  console.log(
    JSON.stringify({
      provider: provider.provider,
      model: provider.model,
      fixture,
      profile: "efficient",
      outcome,
      ...diagnostics,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      cost: usage.cost,
    }),
  );
}
