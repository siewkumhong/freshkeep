import { getDatabase, getPhotoBucket } from "@/db";
import { isIsoDate, subtractCalendarMonth } from "@/lib/date";
import { apiError, requireMembership } from "@/lib/server";

const STATUSES = new Set(["active", "used", "discarded"]);
const LOCATIONS = new Set(["fridge", "pantry"]);
const DATE_TYPES = new Set(["expiry", "best_before", "use_by", "unknown"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireMembership();
    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const db = getDatabase();
    const item = await db
      .prepare("SELECT id FROM items WHERE id = ? AND household_id = ?")
      .bind(id, membership.householdId)
      .first();
    if (!item) return Response.json({ error: "Item not found." }, { status: 404 });

    if (typeof payload.status === "string") {
      if (!STATUSES.has(payload.status)) return bad("Invalid item status.");
      await db
        .prepare("UPDATE items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(payload.status, id)
        .run();
      return Response.json({ ok: true });
    }

    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const itemDate = typeof payload.itemDate === "string" ? payload.itemDate : "";
    const location = typeof payload.location === "string" ? payload.location : "";
    const dateType = typeof payload.dateType === "string" ? payload.dateType : "";
    const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";
    const quantity = Number(payload.quantity);
    if (!name || name.length > 100) return bad("Enter an item name up to 100 characters.");
    if (!isIsoDate(itemDate)) return bad("Enter a valid date.");
    if (!LOCATIONS.has(location) || !DATE_TYPES.has(dateType)) return bad("Check the item details.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return bad("Quantity must be between 1 and 99.");
    if (notes.length > 500) return bad("Notes must be 500 characters or fewer.");

    await db
      .prepare(
        `UPDATE items
         SET name = ?, quantity = ?, location = ?, date_type = ?, item_date = ?,
             reminder_on = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(name, quantity, location, dateType, itemDate, subtractCalendarMonth(itemDate), notes, id)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireMembership();
    const { id } = await context.params;
    const db = getDatabase();
    const item = await db
      .prepare("SELECT photo_key AS photoKey FROM items WHERE id = ? AND household_id = ?")
      .bind(id, membership.householdId)
      .first<{ photoKey: string }>();
    if (!item) return Response.json({ error: "Item not found." }, { status: 404 });
    await db.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
    await getPhotoBucket().delete(item.photoKey);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

function bad(error: string): Response {
  return Response.json({ error }, { status: 400 });
}
