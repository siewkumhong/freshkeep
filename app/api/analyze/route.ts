import { getEnv } from "@/db";
import { isIsoDate } from "@/lib/date";
import { apiError, requireMembership } from "@/lib/server";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

type ScanResult = {
  itemName: string;
  date: string | null;
  dateType: "expiry" | "best_before" | "use_by" | "unknown";
  rawDateText: string | null;
  dateStatus: "confident" | "ambiguous" | "unreadable";
  warnings: string[];
};

export async function POST(request: Request) {
  try {
    await requireMembership();
    const form = await request.formData();
    const itemPhoto = form.get("itemPhoto");
    const datePhoto = form.get("datePhoto");
    if (!(itemPhoto instanceof File) || !(datePhoto instanceof File)) {
      return Response.json({ error: "Both photos are required." }, { status: 400 });
    }
    const invalid = [itemPhoto, datePhoto].find(
      (file) => !ACCEPTED_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES,
    );
    if (invalid) {
      return Response.json(
        { error: "Use a JPEG, PNG, or WebP image smaller than 6 MB." },
        { status: 400 },
      );
    }

    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Photo reading is not configured yet. Enter the details manually." },
        { status: 503 },
      );
    }

    const [itemImage, dateImage] = await Promise.all([
      toDataUrl(itemPhoto),
      toDataUrl(datePhoto),
    ]);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `You extract one household perishable item from two photos. The first photo shows the product; the second shows its expiry, best-before, or use-by label.

Accuracy rules:
- Identify a short, useful item name from the first photo.
- Read a date only from visible text in the second photo. Never infer shelf life.
- Return the date as YYYY-MM-DD only when the year, month, and day are unambiguous.
- Singapore commonly uses day/month/year. If a numeric date could also be month/day/year and surrounding text does not resolve it, mark it ambiguous and return null.
- If several dates appear, choose only one explicitly labelled expiry, best-before, or use-by date. Otherwise mark ambiguous.
- Preserve the exact visible date string in rawDateText when possible.
- Use warnings for anything the person should verify.`,
              },
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
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                itemName: { type: "string" },
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
            },
          },
        },
      }),
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const error = payload.error as { message?: string } | undefined;
      throw new Error(error?.message ?? "The photos could not be read.");
    }
    const outputText = extractOutputText(payload);
    if (!outputText) throw new Error("The photo reader returned no result.");
    const result = JSON.parse(outputText) as ScanResult;
    if (result.date && !isIsoDate(result.date)) {
      result.date = null;
      result.dateStatus = "ambiguous";
      result.warnings = [...result.warnings, "The detected date was invalid; enter it manually."];
    }
    result.itemName = result.itemName.trim().slice(0, 100);
    return Response.json({ result });
  } catch (error) {
    return apiError(error);
  }
}

async function toDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${file.type};base64,${btoa(binary)}`;
}

function extractOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: string }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}
