import { env } from "cloudflare:workers";

export type FreshKeepEnv = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  VISION_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  ANONYMOUS_UPLOAD_SECRET?: string;
  RESEND_API_KEY?: string;
  REMINDER_FROM?: string;
  REMINDER_CRON_SECRET?: string;
  APP_URL?: string;
};

export function getEnv(): FreshKeepEnv {
  return env as unknown as FreshKeepEnv;
}

export function getDatabase(): D1Database {
  const database = getEnv().DB;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }
  return database;
}

export function getPhotoBucket(): R2Bucket {
  const bucket = getEnv().PHOTOS;
  if (!bucket) {
    throw new Error("Cloudflare R2 binding `PHOTOS` is unavailable.");
  }
  return bucket;
}
