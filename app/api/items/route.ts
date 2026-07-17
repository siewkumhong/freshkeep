import { getDatabase, getPhotoBucket } from "@/db";
import { isIsoDate, subtractCalendarMonth } from "@/lib/date";
import {
  consumeAnonymousQuota,
  requireSameOrigin,
  requireUploadAccess,
} from "@/lib/contribution";
import { apiError, newId } from "@/lib/server";

const LOCATIONS = new Set(["fridge", "pantry"]);
const DATE_TYPES = new Set(["expiry", "best_before", "use_by", "unknown"]);
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const access = await requireUploadAccess(request);
    const form = await request.formData();
    const name = stringValue(form, "name").trim();
    const itemDate = stringValue(form, "itemDate");
    const location = stringValue(form, "location");
    const dateType = stringValue(form, "dateType");
    const notes = stringValue(form, "notes").trim();
    const quantity = Number.parseInt(stringValue(form, "quantity"), 10);
    const photo = form.get("photo");

    if (!name || name.length > 100) return bad("Enter an item name up to 100 characters.");
    if (!isIsoDate(itemDate)) return bad("Enter a valid date.");
    if (!LOCATIONS.has(location)) return bad("Choose fridge or pantry.");
    if (!DATE_TYPES.has(dateType)) return bad("Choose a valid date label.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return bad("Quantity must be between 1 and 99.");
    }
    if (notes.length > 500) return bad("Notes must be 500 characters or fewer.");
    if (!(photo instanceof File) || !PHOTO_TYPES.has(photo.type) || photo.size > 6 * 1024 * 1024) {
      return bad("Add a JPEG, PNG, or WebP item photo smaller than 6 MB.");
    }
    await consumeAnonymousQuota(access, "save");

    const itemId = newId("item");
    const photoKey = `${access.householdId}/${itemId}`;
    const bucket = getPhotoBucket();
    await bucket.put(photoKey, await photo.arrayBuffer(), {
      httpMetadata: { contentType: photo.type, cacheControl: "private, max-age=3600" },
      customMetadata: { householdId: access.householdId, itemId },
    });

    try {
      const db = getDatabase();
      await db
        .prepare(
          `INSERT INTO items
           (id, household_id, created_by, name, quantity, location, date_type,
            item_date, reminder_on, notes, photo_key, photo_content_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          itemId,
          access.householdId,
          access.createdBy,
          name,
          quantity,
          location,
          dateType,
          itemDate,
          subtractCalendarMonth(itemDate),
          notes,
          photoKey,
          photo.type,
        )
        .run();
    } catch (error) {
      await bucket.delete(photoKey);
      throw error;
    }

    return Response.json({ id: itemId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

function stringValue(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function bad(error: string): Response {
  return Response.json({ error }, { status: 400 });
}
