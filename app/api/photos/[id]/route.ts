import { getDatabase, getPhotoBucket } from "@/db";
import { apiError, requireMembership } from "@/lib/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { membership } = await requireMembership();
    const { id } = await context.params;
    const row = await getDatabase()
      .prepare(
        "SELECT photo_key AS photoKey, photo_content_type AS contentType FROM items WHERE id = ? AND household_id = ?",
      )
      .bind(id, membership.householdId)
      .first<{ photoKey: string; contentType: string }>();
    if (!row) return new Response("Not found", { status: 404 });
    const object = await getPhotoBucket().get(row.photoKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": row.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
