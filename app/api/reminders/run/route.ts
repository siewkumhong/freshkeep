import { getDatabase, getEnv } from "@/db";
import { todayInTimeZone } from "@/lib/date";
import { escapeHtml, sendEmail } from "@/lib/email";
import { apiError, newId } from "@/lib/server";

type Recipient = {
  memberId: string;
  householdId: string;
  householdName: string;
  timezone: string;
  email: string;
};

type DueItem = {
  id: string;
  name: string;
  quantity: number;
  location: string;
  dateType: string;
  itemDate: string;
  reminderOn: string;
};

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const supplied = request.headers.get("authorization");
    if (!env.REMINDER_CRON_SECRET || supplied !== `Bearer ${env.REMINDER_CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!env.RESEND_API_KEY || !env.REMINDER_FROM) {
      return Response.json({ error: "Email delivery is not configured." }, { status: 503 });
    }

    const db = getDatabase();
    const recipients = await db
      .prepare(
        `SELECT hm.id AS memberId, hm.household_id AS householdId,
                h.name AS householdName, h.timezone, hm.email
         FROM household_members hm
         JOIN households h ON h.id = hm.household_id
         WHERE hm.status = 'active'`,
      )
      .all<Recipient>();

    let emailsSent = 0;
    let itemRemindersSent = 0;
    const failures: string[] = [];
    for (const recipient of recipients.results as Recipient[]) {
      const today = todayInTimeZone(recipient.timezone);
      const due = await db
        .prepare(
          `SELECT i.id, i.name, i.quantity, i.location, i.date_type AS dateType,
                  i.item_date AS itemDate, i.reminder_on AS reminderOn
           FROM items i
           WHERE i.household_id = ? AND i.status = 'active'
             AND i.reminder_on <= ? AND i.item_date >= ?
             AND NOT EXISTS (
               SELECT 1 FROM reminder_deliveries rd
               WHERE rd.item_id = i.id AND rd.recipient_email = ?
                 AND rd.reminder_on = i.reminder_on AND rd.status = 'sent'
             )
           ORDER BY i.item_date ASC`,
        )
        .bind(recipient.householdId, today, today, recipient.email)
        .all<DueItem>();
      const dueItems = due.results as DueItem[];
      if (dueItems.length === 0) continue;

      const signature = await digest(
        dueItems.map((item: DueItem) => `${item.id}:${item.reminderOn}`).join("|"),
      );
      try {
        const result = await sendEmail({
          to: recipient.email,
          subject: `${dueItems.length} ${dueItems.length === 1 ? "item needs" : "items need"} using soon`,
          idempotencyKey: `freshkeep-reminder-${recipient.memberId}-${signature.slice(0, 24)}`,
          text: buildText(recipient.householdName, dueItems, env.APP_URL),
          html: buildHtml(recipient.householdName, dueItems, env.APP_URL),
        });
        const statements = dueItems.map((item: DueItem) =>
          db
            .prepare(
              `INSERT INTO reminder_deliveries
               (id, item_id, recipient_email, reminder_on, status, provider_id, sent_at)
               VALUES (?, ?, ?, ?, 'sent', ?, CURRENT_TIMESTAMP)
               ON CONFLICT(item_id, recipient_email, reminder_on)
               DO UPDATE SET status = 'sent', provider_id = excluded.provider_id,
                             attempts = reminder_deliveries.attempts + 1,
                             last_error = NULL, sent_at = CURRENT_TIMESTAMP`,
            )
            .bind(newId("delivery"), item.id, recipient.email, item.reminderOn, result.id ?? null),
        );
        await db.batch(statements);
        emailsSent += 1;
        itemRemindersSent += dueItems.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Email delivery failed";
        failures.push(`${recipient.email}: ${message}`);
        const statements = dueItems.map((item: DueItem) =>
          db
            .prepare(
              `INSERT INTO reminder_deliveries
               (id, item_id, recipient_email, reminder_on, status, last_error)
               VALUES (?, ?, ?, ?, 'failed', ?)
               ON CONFLICT(item_id, recipient_email, reminder_on)
               DO UPDATE SET status = 'failed', attempts = reminder_deliveries.attempts + 1,
                             last_error = excluded.last_error`,
            )
            .bind(newId("delivery"), item.id, recipient.email, item.reminderOn, message),
        );
        await db.batch(statements);
      }
    }

    return Response.json({ emailsSent, itemRemindersSent, failures });
  } catch (error) {
    return apiError(error);
  }
}

function buildText(household: string, items: DueItem[], appUrl?: string): string {
  const lines = items.map(
    (item) => `• ${item.name} ×${item.quantity} — ${item.itemDate} (${item.location})`,
  );
  return [`FreshKeep reminder for ${household}`, "", ...lines, "", appUrl ?? "Open FreshKeep to update your inventory."].join("\n");
}

function buildHtml(household: string, items: DueItem[], appUrl?: string): string {
  const rows = items
    .map(
      (item) => `<li style="padding:12px 0;border-bottom:1px solid #dde8d8"><strong>${escapeHtml(item.name)}</strong> ×${item.quantity}<br><span style="color:#617166">${escapeHtml(label(item.dateType))} ${escapeHtml(item.itemDate)} · ${escapeHtml(item.location)}</span></li>`,
    )
    .join("");
  const button = appUrl
    ? `<p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#2f5946;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open FreshKeep</a></p>`
    : "";
  return `<div style="font-family:Arial,sans-serif;color:#234537;max-width:560px;margin:auto;padding:32px"><p style="color:#cc654d;font-weight:700">FreshKeep</p><h1 style="font-family:Georgia,serif">Use these next</h1><p>Items in ${escapeHtml(household)} have entered their one-month reminder window.</p><ul style="list-style:none;padding:0">${rows}</ul>${button}<p style="color:#6f7e73;font-size:13px">You receive this because you are an active household member.</p></div>`;
}

function label(value: string): string {
  return value === "best_before" ? "Best before" : value === "use_by" ? "Use by" : "Expires";
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
