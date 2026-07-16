import { getDatabase } from "@/db";
import {
  activatePendingMembership,
  apiError,
  getMembership,
  requireApiUser,
} from "@/lib/server";

export async function GET() {
  try {
    const user = await requireApiUser();
    await activatePendingMembership(user);
    const membership = await getMembership(user.email);
    const db = getDatabase();

    if (!membership) {
      const count = await db
        .prepare("SELECT COUNT(*) AS count FROM households")
        .first<{ count: number }>();
      return Response.json({
        user,
        needsHousehold: Number(count?.count ?? 0) === 0,
        waitingForInvite: Number(count?.count ?? 0) > 0,
      });
    }

    const [itemResult, memberResult] = await Promise.all([
      db
        .prepare(
          `SELECT id, name, quantity, location, date_type AS dateType,
                  item_date AS itemDate, reminder_on AS reminderOn, notes,
                  status, created_by AS createdBy, created_at AS createdAt,
                  updated_at AS updatedAt
           FROM items
           WHERE household_id = ?
           ORDER BY item_date ASC, created_at DESC`,
        )
        .bind(membership.householdId)
        .all(),
      db
        .prepare(
          `SELECT id, email, display_name AS displayName, role, status, created_at AS createdAt
           FROM household_members
           WHERE household_id = ?
           ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, email ASC`,
        )
        .bind(membership.householdId)
        .all(),
    ]);

    return Response.json({
      user,
      household: {
        id: membership.householdId,
        name: membership.householdName,
        timezone: membership.timezone,
        role: membership.role,
      },
      items: itemResult.results,
      members: memberResult.results,
    });
  } catch (error) {
    return apiError(error);
  }
}
