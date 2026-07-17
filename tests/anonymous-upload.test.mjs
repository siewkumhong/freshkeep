import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps anonymous access add-only", async () => {
  const [page, client, analysis, createItem, editItem, photos] = await Promise.all([
    readFile(new URL("app/add/page.tsx", root), "utf8"),
    readFile(new URL("app/add/AnonymousAddApp.tsx", root), "utf8"),
    readFile(new URL("app/api/analyze/route.ts", root), "utf8"),
    readFile(new URL("app/api/items/route.ts", root), "utf8"),
    readFile(new URL("app/api/items/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/photos/[id]/route.ts", root), "utf8"),
  ]);
  assert.doesNotMatch(page, /requireChatGPTUser/);
  assert.match(client, /history\.replaceState/);
  assert.match(client, /<AddItemFlow[^>]+contribution/);
  assert.doesNotMatch(client, /api\/bootstrap|api\/photos|api\/items\/\$\{/);
  assert.match(analysis, /requireUploadAccess\(request\)/);
  assert.match(createItem, /requireUploadAccess\(request\)/);
  assert.match(editItem, /requireMembership/);
  assert.match(photos, /requireMembership/);
});

test("includes durable atomic household quotas", async () => {
  const [schema, migration, contribution] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0001_mysterious_changeling.sql", root), "utf8"),
    readFile(new URL("lib/contribution.ts", root), "utf8"),
  ]);
  assert.match(schema, /anonymous_upload_usage/);
  assert.match(migration, /PRIMARY KEY\(`household_id`, `usage_date`\)/);
  assert.match(contribution, /ANONYMOUS_DAILY_LIMIT = 50/);
  assert.match(contribution, /ON CONFLICT\(household_id, usage_date\) DO UPDATE/);
  assert.match(contribution, /anonymous-upload/);
});

test("uses a secure server cookie and never stores the date-label photo", async () => {
  const [session, flow, itemRoute] = await Promise.all([
    readFile(new URL("app/api/contribution-session/route.ts", root), "utf8"),
    readFile(new URL("app/AddItemFlow.tsx", root), "utf8"),
    readFile(new URL("app/api/items/route.ts", root), "utf8"),
  ]);
  assert.match(session, /httpOnly:\s*true/);
  assert.match(session, /sameSite:\s*"strict"/);
  assert.match(session, /secure:\s*process\.env\.NODE_ENV === "production"/);
  assert.match(flow, /datePhoto/);
  assert.doesNotMatch(itemRoute, /datePhoto/);
  assert.match(itemRoute, /body\.set|bucket\.put|photoKey/);
});
