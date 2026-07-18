import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("moves existing items and deliveries to the two-month schedule", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      item_date TEXT NOT NULL,
      reminder_on TEXT NOT NULL
    );
    CREATE TABLE reminder_deliveries (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      reminder_on TEXT NOT NULL
    );
    INSERT INTO items VALUES
      ('regular', '2026-07-19', '2026-06-19'),
      ('month-end', '2026-04-30', '2026-03-30'),
      ('leap-year', '2024-04-30', '2024-03-30'),
      ('year-boundary', '2026-01-31', '2025-12-31');
    INSERT INTO reminder_deliveries VALUES
      ('sent', 'month-end', 'owner@example.com', '2026-03-30');
  `);

  db.exec(readFileSync(new URL("../drizzle/0002_reminder_two_months.sql", import.meta.url), "utf8"));

  assert.deepEqual(
    db
      .prepare("SELECT id, reminder_on AS reminderOn FROM items ORDER BY id")
      .all()
      .map((row) => ({ ...row })),
    [
      { id: "leap-year", reminderOn: "2024-02-29" },
      { id: "month-end", reminderOn: "2026-02-28" },
      { id: "regular", reminderOn: "2026-05-19" },
      { id: "year-boundary", reminderOn: "2025-11-30" },
    ],
  );
  assert.equal(
    db.prepare("SELECT reminder_on FROM reminder_deliveries WHERE id = 'sent'").get().reminder_on,
    "2026-02-28",
  );
});
