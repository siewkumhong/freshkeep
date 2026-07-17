import {
  CONTRIBUTION_COOKIE,
  requireSameOrigin,
  validateContributionToken,
} from "@/lib/contribution";
import { apiError, HttpError } from "@/lib/server";
import { cookies } from "next/headers";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function GET() {
  try {
    const token = (await cookies()).get(CONTRIBUTION_COOKIE)?.value;
    const household = token ? await validateContributionToken(token) : null;
    if (!household) throw new HttpError(401, "This private add link is not active.");
    return Response.json({ householdName: household.name });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const payload = (await request.json().catch(() => null)) as
      | { token?: unknown }
      | null;
    const token = typeof payload?.token === "string" ? payload.token : "";
    const household = token ? await validateContributionToken(token) : null;
    if (!household) throw new HttpError(401, "This private add link is not valid.");
    (await cookies()).set(CONTRIBUTION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return Response.json({ householdName: household.name });
  } catch (error) {
    return apiError(error);
  }
}
