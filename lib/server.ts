import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { getDatabase } from "@/db";

export type Membership = {
  id: string;
  householdId: string;
  householdName: string;
  timezone: string;
  email: string;
  displayName: string | null;
  role: "owner" | "member";
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requireApiUser(): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return { ...user, email: normalizeEmail(user.email) };
}

export async function activatePendingMembership(user: ChatGPTUser) {
  const db = getDatabase();
  await db
    .prepare(
      `UPDATE household_members
       SET status = 'active', display_name = ?, activated_at = CURRENT_TIMESTAMP
       WHERE email = ? AND status = 'pending'`,
    )
    .bind(user.displayName, normalizeEmail(user.email))
    .run();
}

export async function getMembership(email: string): Promise<Membership | null> {
  const db = getDatabase();
  const row = await db
    .prepare(
      `SELECT hm.id, hm.household_id AS householdId, h.name AS householdName,
              h.timezone, hm.email, hm.display_name AS displayName, hm.role
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
       WHERE hm.email = ? AND hm.status = 'active'
       LIMIT 1`,
    )
    .bind(normalizeEmail(email))
    .first<Membership>();
  return row ?? null;
}

export async function requireMembership(): Promise<{
  user: ChatGPTUser;
  membership: Membership;
}> {
  const user = await requireApiUser();
  await activatePendingMembership(user);
  const membership = await getMembership(user.email);
  if (!membership) throw new HttpError(403, "You are not a member of this household.");
  return { user, membership };
}

export async function requireOwner() {
  const context = await requireMembership();
  if (context.membership.role !== "owner") {
    throw new HttpError(403, "Only the household owner can do that.");
  }
  return context;
}

export function apiError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(error);
  return Response.json({ error: message }, { status: 500 });
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
