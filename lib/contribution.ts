import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDatabase, getEnv } from "@/db";
import { todayInTimeZone } from "@/lib/date";
import {
  createContributionToken,
  verifyContributionToken,
} from "@/lib/contribution-token";
import {
  activatePendingMembership,
  getMembership,
  HttpError,
  normalizeEmail,
} from "@/lib/server";
import { cookies } from "next/headers";

export const CONTRIBUTION_COOKIE = "freshkeep_contribution";
export const ANONYMOUS_DAILY_LIMIT = 50;

export type UploadAccess = {
  householdId: string;
  householdName: string;
  timezone: string;
  createdBy: string;
  anonymous: boolean;
};

type Household = {
  id: string;
  name: string;
  timezone: string;
};

export async function requireUploadAccess(request?: Request): Promise<UploadAccess> {
  const contributionOnly =
    request?.headers.get("x-freshkeep-contribution") === "1";
  if (contributionOnly) return requireContributionAccess();

  const user = await getChatGPTUser();
  if (user) {
    const normalizedUser = { ...user, email: normalizeEmail(user.email) };
    await activatePendingMembership(normalizedUser);
    const membership = await getMembership(normalizedUser.email);
    if (membership) {
      return {
        householdId: membership.householdId,
        householdName: membership.householdName,
        timezone: membership.timezone,
        createdBy: normalizedUser.email,
        anonymous: false,
      };
    }
  }

  return requireContributionAccess();
}

async function requireContributionAccess(): Promise<UploadAccess> {
  const token = (await cookies()).get(CONTRIBUTION_COOKIE)?.value;
  const household = token ? await validateContributionToken(token) : null;
  if (!household) {
    throw new HttpError(401, "Open the household’s private add link to continue.");
  }
  return {
    householdId: household.id,
    householdName: household.name,
    timezone: household.timezone,
    createdBy: "anonymous-upload",
    anonymous: true,
  };
}

export async function validateContributionToken(
  token: string,
): Promise<Household | null> {
  const householdId = await verifyContributionToken(token, contributionSecret());
  if (!householdId) return null;
  return (
    (await getDatabase()
      .prepare("SELECT id, name, timezone FROM households WHERE id = ?")
      .bind(householdId)
      .first<Household>()) ?? null
  );
}

export async function contributionLink(
  householdId: string,
  origin: string,
): Promise<string> {
  const token = await createContributionToken(householdId, contributionSecret());
  return `${new URL("/add", origin).toString()}#${token}`;
}

export async function consumeAnonymousQuota(
  access: UploadAccess,
  action: "analysis" | "save",
): Promise<void> {
  if (!access.anonymous) return;
  const analysisIncrement = action === "analysis" ? 1 : 0;
  const saveIncrement = action === "save" ? 1 : 0;
  const column = action === "analysis" ? "analysis_count" : "save_count";
  const result = await getDatabase()
    .prepare(
      `INSERT INTO anonymous_upload_usage
       (household_id, usage_date, analysis_count, save_count)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(household_id, usage_date) DO UPDATE SET
         ${column} = ${column} + 1
       WHERE ${column} < ?`,
    )
    .bind(
      access.householdId,
      todayInTimeZone(access.timezone),
      analysisIncrement,
      saveIncrement,
      ANONYMOUS_DAILY_LIMIT,
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new HttpError(
      429,
      "This household has reached today’s no-login upload limit. Try again tomorrow or sign in.",
    );
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

function contributionSecret(): string {
  const secret = getEnv().ANONYMOUS_UPLOAD_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new HttpError(503, "No-login uploads are not configured yet.");
  }
  return secret;
}
