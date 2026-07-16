import { getDatabase } from "@/db";
import { apiError, getMembership, newId, requireApiUser } from "@/lib/server";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    if (await getMembership(user.email)) {
      return Response.json({ error: "You already belong to a household." }, { status: 409 });
    }
    const payload = (await request.json()) as { name?: string };
    const name = payload.name?.trim();
    if (!name || name.length > 60) {
      return Response.json({ error: "Enter a household name up to 60 characters." }, { status: 400 });
    }

    const db = getDatabase();
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM households")
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) > 0) {
      return Response.json({ error: "Ask the household owner for an invitation." }, { status: 403 });
    }

    const householdId = newId("home");
    await db.batch([
      db
        .prepare(
          "INSERT INTO households (id, name, timezone) VALUES (?, ?, 'Asia/Singapore')",
        )
        .bind(householdId, name),
      db
        .prepare(
          `INSERT INTO household_members
           (id, household_id, email, display_name, role, status, activated_at)
           VALUES (?, ?, ?, ?, 'owner', 'active', CURRENT_TIMESTAMP)`,
        )
        .bind(newId("member"), householdId, user.email, user.displayName),
    ]);
    return Response.json({ householdId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
