import { getEnv, getDatabase } from "@/db";
import { escapeHtml, sendEmail } from "@/lib/email";
import { apiError, newId, normalizeEmail, requireOwner } from "@/lib/server";

export async function POST(request: Request) {
  try {
    const { user, membership } = await requireOwner();
    const payload = (await request.json()) as { email?: string };
    const email = normalizeEmail(payload.email ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (email === user.email) {
      return Response.json({ error: "You are already the household owner." }, { status: 409 });
    }

    const db = getDatabase();
    const existing = await db
      .prepare(
        "SELECT id, status FROM household_members WHERE household_id = ? AND email = ?",
      )
      .bind(membership.householdId, email)
      .first<{ id: string; status: string }>();
    if (existing?.status === "active") {
      return Response.json({ error: "That person is already a member." }, { status: 409 });
    }

    const id = existing?.id ?? newId("member");
    if (existing) {
      await db
        .prepare(
          "UPDATE household_members SET invited_by = ?, status = 'pending' WHERE id = ?",
        )
        .bind(user.email, id)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO household_members
           (id, household_id, email, role, status, invited_by)
           VALUES (?, ?, ?, 'member', 'pending', ?)`,
        )
        .bind(id, membership.householdId, email, user.email)
        .run();
    }

    const appUrl = getEnv().APP_URL ?? new URL(request.url).origin;
    const emailResult = await sendEmail({
      to: email,
      subject: `Join ${membership.householdName} on FreshKeep`,
      idempotencyKey: `freshkeep-invite-${id}`,
      text: `${user.displayName} invited you to share ${membership.householdName}'s perishables inventory. Sign in at ${appUrl}`,
      html: `<div style="font-family:Arial,sans-serif;color:#234537;max-width:560px;margin:auto;padding:32px"><p style="color:#cc654d;font-weight:700">FreshKeep</p><h1 style="font-family:Georgia,serif">You’re invited to ${escapeHtml(membership.householdName)}</h1><p>${escapeHtml(user.displayName)} invited you to share the household perishables inventory.</p><p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#2f5946;color:white;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open FreshKeep</a></p><p style="color:#6f7e73;font-size:14px">Sign in with this email address: ${escapeHtml(email)}</p></div>`,
    });

    return Response.json(
      { member: { id, email, role: "member", status: "pending" }, emailSent: emailResult.configured },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
