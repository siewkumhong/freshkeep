import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the FreshKeep product shell without starter metadata", async () => {
  const [page, layout, client, addFlow, anonymousAdd, css, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/FreshKeepApp.tsx", root), "utf8"),
    readFile(new URL("app/AddItemFlow.tsx", root), "utf8"),
    readFile(new URL("app/add/AnonymousAddApp.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(page, /requireChatGPTUser/);
  assert.match(layout, /FreshKeep — Know what to use next/);
  assert.match(layout, /\/og\.png/);
  assert.match(`${client}${addFlow}`, /Add a perishable/);
  assert.match(addFlow, /The date photo is read once and never saved/);
  assert.match(addFlow, /Enter details manually/);
  assert.match(addFlow, /lastAnalysis\.current/);
  assert.match(addFlow, /EFFICIENT_IMAGE_LIMITS/);
  assert.match(anonymousAdd, /No account needed/);
  assert.match(client, /Expiring Soon|Use soon/);
  assert.match(css, /--sage:\s*#2f5946/);
  assert.doesNotMatch(`${page}${layout}${packageJson}`, /codex-preview|react-loading-skeleton/i);
});

test("includes durable schema and reminder de-duplication", async () => {
  const [schema, migration, reminderRoute] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0000_greedy_the_twelve.sql", root), "utf8"),
    readFile(new URL("app/api/reminders/run/route.ts", root), "utf8"),
  ]);
  for (const table of ["households", "household_members", "items", "reminder_deliveries"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(schema, /reminder_delivery_once_unique/);
  assert.match(reminderRoute, /Idempotency|idempotencyKey/i);
});
