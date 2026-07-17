import assert from "node:assert/strict";
import test from "node:test";
import {
  createContributionToken,
  verifyContributionToken,
} from "../lib/contribution-token.ts";

const HOUSEHOLD = "home_123e4567-e89b-12d3-a456-426614174000";
const SECRET = "freshkeep-test-secret-that-is-long-enough-123";

test("creates a stable persistent token for the same household and secret", async () => {
  const first = await createContributionToken(HOUSEHOLD, SECRET);
  const second = await createContributionToken(HOUSEHOLD, SECRET);
  assert.equal(first, second);
  assert.equal(await verifyContributionToken(first, SECRET), HOUSEHOLD);
  const link = new URL(`https://freshkeep.example/add#${first}`);
  assert.equal(link.pathname, "/add");
  assert.equal(link.search, "");
  assert.equal(link.hash.slice(1), first);
});

test("rejects tampered, malformed, and differently signed tokens", async () => {
  const token = await createContributionToken(HOUSEHOLD, SECRET);
  assert.equal(await verifyContributionToken(`${token}x`, SECRET), null);
  assert.equal(await verifyContributionToken(token, `${SECRET}-different`), null);
  assert.equal(await verifyContributionToken("not-a-token", SECRET), null);
  assert.equal(
    await verifyContributionToken(token.replace(HOUSEHOLD, "home_00000000-0000-0000-0000-000000000000"), SECRET),
    null,
  );
});
