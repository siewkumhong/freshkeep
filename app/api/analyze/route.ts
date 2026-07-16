import { getEnv } from "@/db";
import { apiError, requireMembership } from "@/lib/server";
import {
  analyzeVisionImages,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  resolveVisionConfig,
  VisionConfigurationError,
} from "@/lib/vision";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

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
    const [itemImage, dateImage] = await Promise.all([
      toDataUrl(itemPhoto),
      toDataUrl(datePhoto),
    ]);
    const startedAt = Date.now();
    const selectedProvider = env.VISION_PROVIDER?.trim().toLowerCase() || "openai";
    const selectedModel =
      selectedProvider === "openrouter"
        ? env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
        : env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
    try {
      const config = resolveVisionConfig(env);
      const result = await analyzeVisionImages(config, itemImage, dateImage);
      logAnalysis(config.provider, config.model, startedAt, "success");
      return Response.json({ result });
    } catch (error) {
      logAnalysis(selectedProvider, selectedModel, startedAt, "failure");
      const status = error instanceof VisionConfigurationError ? 503 : 502;
      return Response.json(
        { error: "The photos could not be read safely. Enter the details manually." },
        { status },
      );
    }
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

function logAnalysis(
  provider: string,
  model: string,
  startedAt: number,
  outcome: "success" | "failure",
) {
  console.info(
    JSON.stringify({
      provider,
      model,
      latencyMs: Date.now() - startedAt,
      outcome,
    }),
  );
}
