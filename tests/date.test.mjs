import assert from "node:assert/strict";
import test from "node:test";
import { isIsoDate, subtractCalendarMonth } from "../lib/date.ts";

test("subtracts one calendar month and clamps month-end dates", () => {
  assert.equal(subtractCalendarMonth("2026-03-31"), "2026-02-28");
  assert.equal(subtractCalendarMonth("2024-03-31"), "2024-02-29");
  assert.equal(subtractCalendarMonth("2026-01-31"), "2025-12-31");
  assert.equal(subtractCalendarMonth("2026-08-31"), "2026-07-31");
});

test("rejects invalid and non-ISO dates", () => {
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("31/08/2026"), false);
  assert.throws(() => subtractCalendarMonth("2026-02-29"));
});
