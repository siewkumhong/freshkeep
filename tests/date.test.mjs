import assert from "node:assert/strict";
import test from "node:test";
import { isIsoDate, subtractTwoCalendarMonths } from "../lib/date.ts";

test("subtracts two calendar months and clamps month-end dates", () => {
  assert.equal(subtractTwoCalendarMonths("2026-04-30"), "2026-02-28");
  assert.equal(subtractTwoCalendarMonths("2024-04-30"), "2024-02-29");
  assert.equal(subtractTwoCalendarMonths("2026-01-31"), "2025-11-30");
  assert.equal(subtractTwoCalendarMonths("2026-08-31"), "2026-06-30");
});

test("rejects invalid and non-ISO dates", () => {
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("31/08/2026"), false);
  assert.throws(() => subtractTwoCalendarMonths("2026-02-29"));
});
