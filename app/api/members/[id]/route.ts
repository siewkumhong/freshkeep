import { getDatabase } from "@/db";
import { apiError, requireOwner } from "@/lib/server";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireOwner();
    const { id } = await context.params;
    const db = getDatabase();
    const member = await db
      .prepare("SELECT role FROM household_members WHERE id = ? AND household_id = ?")
      .bind(id, membership.householdId)
      .first<{ role: string }>();
    if (!member) return Response.json({ error: "Member not found." }, { status: 404 });
    if (member.role === "owner") {
      return Response.json({ error: "The household owner cannot be removed." }, { status: 400 });
    }
    await db.prepare("DELETE FROM household_members WHERE id = ?").bind(id).run();
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
