import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeVisionImages,
  buildOpenAIRequest,
  buildOpenRouterRequest,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  normalizeScanResult,
  resolveVisionConfig,
  VisionConfigurationError,
  VisionProviderError,
} from "../lib/vision.ts";

const ITEM_IMAGE = "data:image/jpeg;base64,aXRlbQ==";
const DATE_IMAGE = "data:image/jpeg;base64,ZGF0ZQ==";
const VALID_RESULT = {
  itemName: "Fresh milk",
  date: "2026-12-31",
  dateType: "expiry",
  rawDateText: "EXP 31/12/2026",
  dateStatus: "confident",
  warnings: [],
};

test("selects OpenAI by default and OpenRouter only when configured", () => {
  assert.deepEqual(resolveVisionConfig({ OPENAI_API_KEY: "openai-key" }), {
    provider: "openai",
    apiKey: "openai-key",
    model: DEFAULT_OPENAI_MODEL,
    appUrl: undefined,
  });
  assert.deepEqual(
    resolveVisionConfig({
      VISION_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "openrouter-key",
    }),
    {
      provider: "openrouter",
      apiKey: "openrouter-key",
      model: DEFAULT_OPENROUTER_MODEL,
      appUrl: undefined,
    },
  );
  assert.throws(
    () => resolveVisionConfig({ VISION_PROVIDER: "openrouter" }),
    VisionConfigurationError,
  );
  assert.throws(
    () => resolveVisionConfig({ VISION_PROVIDER: "automatic", OPENAI_API_KEY: "key" }),
    VisionConfigurationError,
  );
});

test("keeps the OpenAI Responses request contract", () => {
  const body = buildOpenAIRequest("vision-model", ITEM_IMAGE, DATE_IMAGE);
  assert.equal(body.model, "vision-model");
  assert.equal(body.input[0].content[1].type, "input_image");
  assert.equal(body.input[0].content[1].image_url, ITEM_IMAGE);
  assert.equal(body.input[0].content[2].image_url, DATE_IMAGE);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
});

test("builds one constrained OpenRouter request with explicitly labelled images", () => {
  const body = buildOpenRouterRequest("qwen/model", ITEM_IMAGE, DATE_IMAGE);
  assert.equal(body.model, "qwen/model");
  assert.match(body.messages[0].content[0].text, /IMAGE 1 — ITEM FRONT/);
  assert.equal(body.messages[0].content[1].image_url.url, ITEM_IMAGE);
  assert.equal(body.messages[0].content[2].text, "IMAGE 2 — DATE LABEL:");
  assert.equal(body.messages[0].content[3].image_url.url, DATE_IMAGE);
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 300);
  assert.deepEqual(body.provider, { require_parameters: true, zdr: true });
});

test("accepts only complete, valid, confident ISO dates", () => {
  assert.deepEqual(normalizeScanResult(VALID_RESULT), VALID_RESULT);

  for (const unsafe of [
    { ...VALID_RESULT, date: "2026-02-29" },
    { ...VALID_RESULT, date: "31/12/2026" },
    { ...VALID_RESULT, date: null },
    { ...VALID_RESULT, dateStatus: "ambiguous" },
    { ...VALID_RESULT, dateStatus: "unreadable" },
    { ...VALID_RESULT, date: "2027-04-03", rawDateText: "EXP 03/04/2027" },
    {
      ...VALID_RESULT,
      rawDateText: "PACKED 01/11/2026 EXP 31/12/2026",
    },
  ]) {
    const result = normalizeScanResult(unsafe);
    assert.equal(result.date, null);
    assert.notEqual(result.dateStatus, "confident");
    assert.ok(result.warnings.length > 0);
  }
});

test("rejects malformed fields and enums instead of repairing them", () => {
  assert.throws(() => normalizeScanResult({ ...VALID_RESULT, warnings: "check" }));
  assert.throws(() => normalizeScanResult({ ...VALID_RESULT, dateType: "sell_by" }));
  assert.throws(() => normalizeScanResult({ ...VALID_RESULT, dateStatus: "certain" }));
  assert.throws(() => normalizeScanResult({ ...VALID_RESULT, rawDateText: 123 }));
  const missingKey = { ...VALID_RESULT };
  delete missingKey.itemName;
  assert.throws(() => normalizeScanResult(missingKey));
});

test("parses OpenRouter structured output and sends the expected headers", async () => {
  let request;
  const fetcher = async (url, init) => {
    request = { url, init };
    return Response.json({ choices: [{ message: { content: JSON.stringify(VALID_RESULT) } }] });
  };
  const result = await analyzeVisionImages(
    {
      provider: "openrouter",
      apiKey: "secret-key",
      model: DEFAULT_OPENROUTER_MODEL,
      appUrl: "https://freshkeep.example",
    },
    ITEM_IMAGE,
    DATE_IMAGE,
    fetcher,
  );
  assert.deepEqual(result, VALID_RESULT);
  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.init.headers.Authorization, "Bearer secret-key");
  assert.equal(request.init.headers["HTTP-Referer"], "https://freshkeep.example");
});

test("rate limits, provider failures, and malformed JSON fail once into manual fallback", async () => {
  let calls = 0;
  const rateLimited = async () => {
    calls += 1;
    return Response.json({ error: { message: "rate limited" } }, { status: 429 });
  };
  await assert.rejects(
    analyzeVisionImages(
      { provider: "openrouter", apiKey: "key", model: DEFAULT_OPENROUTER_MODEL },
      ITEM_IMAGE,
      DATE_IMAGE,
      rateLimited,
    ),
    VisionProviderError,
  );
  assert.equal(calls, 1);

  await assert.rejects(
    analyzeVisionImages(
      { provider: "openai", apiKey: "key", model: DEFAULT_OPENAI_MODEL },
      ITEM_IMAGE,
      DATE_IMAGE,
      async () => Response.json({ output_text: "not-json" }),
    ),
    VisionProviderError,
  );
});
