import { getEnv } from "@/db";
import { contributionLink } from "@/lib/contribution";
import { apiError, requireOwner } from "@/lib/server";

export async function GET(request: Request) {
  try {
    const { membership } = await requireOwner();
    const origin = getEnv().APP_URL ?? new URL(request.url).origin;
    return Response.json({
      link: await contributionLink(membership.householdId, origin),
    });
  } catch (error) {
    return apiError(error);
  }
}
