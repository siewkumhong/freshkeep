import { isIsoDate } from "./date.ts";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
export const DEFAULT_OPENROUTER_MODEL = "qwen/qwen3-vl-30b-a3b-instruct";

export type VisionProvider = "openai" | "openrouter";

export type ScanResult = {
  itemName: string;
  date: string | null;
  dateType: "expiry" | "best_before" | "use_by" | "unknown";
  rawDateText: string | null;
  dateStatus: "confident" | "ambiguous" | "unreadable";
  warnings: string[];
};

type VisionEnvironment = {
  VISION_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  APP_URL?: string;
};

export type VisionConfig = {
  provider: VisionProvider;
  apiKey: string;
  model: string;
  appUrl?: string;
};

export class VisionConfigurationError extends Error {}
export class VisionProviderError extends Error {}

export const EXTRACTION_PROMPT = `You extract one household perishable item from two explicitly labelled photos.

Accuracy rules:
- Identify a short, useful item name only from IMAGE 1 — ITEM FRONT.
- Read a date only from visible text in IMAGE 2 — DATE LABEL. Never infer shelf life or repair incomplete text.
- Return the date as YYYY-MM-DD only when the year, month, and day are unambiguous.
- Singapore commonly uses day/month/year. If a numeric date could also be month/day/year and surrounding text does not resolve it, mark it ambiguous and return null.
- If more than one complete date appears, mark the result ambiguous and return null.
- If the date is missing, invalid, blurred, obscured, or incomplete, return null and mark it ambiguous or unreadable.
- Preserve the exact visible date string in rawDateText when possible.
- Use warnings for anything the person should verify. Human confirmation is always required.`;

export const SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    itemName: { type: "string", maxLength: 100 },
    date: { type: ["string", "null"] },
    dateType: {
      type: "string",
      enum: ["expiry", "best_before", "use_by", "unknown"],
    },
    rawDateText: { type: ["string", "null"] },
    dateStatus: {
      type: "string",
      enum: ["confident", "ambiguous", "unreadable"],
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "itemName",
    "date",
    "dateType",
    "rawDateText",
    "dateStatus",
    "warnings",
  ],
} as const;

export function resolveVisionConfig(env: VisionEnvironment): VisionConfig {
  const provider = env.VISION_PROVIDER?.trim().toLowerCase() || "openai";
  if (provider !== "openai" && provider !== "openrouter") {
    throw new VisionConfigurationError(
      "VISION_PROVIDER must be either openai or openrouter.",
    );
  }

  const apiKey =
    provider === "openai" ? env.OPENAI_API_KEY : env.OPENROUTER_API_KEY;
  if (!apiKey?.trim()) {
    throw new VisionConfigurationError(
      `The ${provider} photo reader is not configured.`,
    );
  }

  return {
    provider,
    apiKey: apiKey.trim(),
    model:
      provider === "openai"
        ? env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
        : env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
    appUrl: validAppUrl(env.APP_URL),
  };
}

export function buildOpenAIRequest(
  model: string,
  itemImage: string,
  dateImage: string,
) {
  return {
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: EXTRACTION_PROMPT },
          { type: "input_image", image_url: itemImage, detail: "high" },
          { type: "input_image", image_url: dateImage, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "perishable_scan",
        strict: true,
        schema: SCAN_SCHEMA,
      },
    },
  };
}

export function buildOpenRouterRequest(
  model: string,
  itemImage: string,
  dateImage: string,
) {
  return {
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${EXTRACTION_PROMPT}\n\nIMAGE 1 — ITEM FRONT:`,
          },
          { type: "image_url", image_url: { url: itemImage } },
          { type: "text", text: "IMAGE 2 — DATE LABEL:" },
          { type: "image_url", image_url: { url: dateImage } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "perishable_scan",
        strict: true,
        schema: SCAN_SCHEMA,
      },
    },
    temperature: 0,
    max_tokens: 300,
    provider: {
      require_parameters: true,
      zdr: true,
    },
  };
}

export async function analyzeVisionImages(
  config: VisionConfig,
  itemImage: string,
  dateImage: string,
  fetcher: typeof fetch = fetch,
): Promise<ScanResult> {
  const isOpenAI = config.provider === "openai";
  const response = await callProvider(
    fetcher,
    isOpenAI
      ? "https://api.openai.com/v1/responses"
      : "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: providerHeaders(config),
      body: JSON.stringify(
        isOpenAI
          ? buildOpenAIRequest(config.model, itemImage, dateImage)
          : buildOpenRouterRequest(config.model, itemImage, dateImage),
      ),
    },
  );

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new VisionProviderError("The selected photo reader could not respond.");
  }

  const outputText = isOpenAI
    ? extractOpenAIOutputText(payload)
    : extractOpenRouterOutputText(payload);
  if (!outputText) {
    throw new VisionProviderError("The selected photo reader returned no result.");
  }

  try {
    return normalizeScanResult(JSON.parse(outputText));
  } catch {
    throw new VisionProviderError("The selected photo reader returned an invalid result.");
  }
}

export function normalizeScanResult(value: unknown): ScanResult {
  if (!isRecord(value)) throw new Error("Result must be an object.");

  const itemName = requiredString(value.itemName, "itemName").trim().slice(0, 100);
  const date = nullableString(value.date, "date");
  const rawDateText = nullableString(value.rawDateText, "rawDateText");
  const dateType = enumValue(
    value.dateType,
    ["expiry", "best_before", "use_by", "unknown"] as const,
    "dateType",
  );
  let dateStatus = enumValue(
    value.dateStatus,
    ["confident", "ambiguous", "unreadable"] as const,
    "dateStatus",
  );
  if (!Array.isArray(value.warnings) || !value.warnings.every((item) => typeof item === "string")) {
    throw new Error("warnings must be an array of strings.");
  }
  const warnings = value.warnings.map((warning) => warning.trim()).filter(Boolean);
  const hasMultipleDates =
    containsMultipleDateCandidates(rawDateText) ||
    warnings.some((warning) => /\b(multiple|several|more than one)\b/i.test(warning));
  const hasAmbiguousNumericDate = containsAmbiguousNumericDate(rawDateText);
  let acceptedDate = date;

  if (
    dateStatus !== "confident" ||
    !acceptedDate ||
    !isIsoDate(acceptedDate) ||
    hasMultipleDates ||
    hasAmbiguousNumericDate
  ) {
    acceptedDate = null;
    if (dateStatus === "confident") dateStatus = "ambiguous";
    if (
      !warnings.length ||
      !isIsoDate(date ?? "") ||
      hasMultipleDates ||
      hasAmbiguousNumericDate
    ) {
      warnings.push("Enter the date manually; it could not be accepted safely.");
    }
  }

  return {
    itemName,
    date: acceptedDate,
    dateType,
    rawDateText,
    dateStatus,
    warnings,
  };
}

function providerHeaders(config: VisionConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  if (config.provider === "openrouter") {
    headers["X-OpenRouter-Title"] = "FreshKeep";
    if (config.appUrl) headers["HTTP-Referer"] = config.appUrl;
  }
  return headers;
}

async function callProvider(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch {
    throw new VisionProviderError("The selected photo reader could not be reached.");
  }
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    if (isRecord(value)) return value;
  } catch {
    // The generic provider error below intentionally does not expose response content.
  }
  throw new VisionProviderError("The selected photo reader returned an invalid response.");
}

function extractOpenAIOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (
        isRecord(part) &&
        part.type === "output_text" &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
    }
  }
  return null;
}

function extractOpenRouterOutputText(payload: Record<string, unknown>): string | null {
  if (!Array.isArray(payload.choices)) return null;
  const first = payload.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return null;
  return typeof first.message.content === "string" ? first.message.content : null;
}

function containsMultipleDateCandidates(value: string | null): boolean {
  if (!value) return false;
  const matches = value.match(
    /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{2,4})\b/gi,
  );
  return new Set(matches?.map((match) => match.toLowerCase()) ?? []).size > 1;
}

function containsAmbiguousNumericDate(value: string | null): boolean {
  if (!value) return false;
  const matches = value.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}\b/g);
  for (const match of matches) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first <= 12 && second <= 12 && first !== second) return true;
  }
  return false;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function enumValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  field: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validAppUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}
