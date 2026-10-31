import assert from "node:assert/strict";
import test from "node:test";
import {
  attemptsRemaining, cooldownSeconds, formatCooldown, isCompleteVerificationCode,
  isEmailUnverified, needsNewCode, sanitizeVerificationCode,
} from "../src/features/emailVerification.ts";

test("pasted codes preserve leading zeroes and strip formatting", () => {
  assert.equal(sanitizeVerificationCode("Code: 012-345"), "012345");
  assert.equal(sanitizeVerificationCode("1234567"), "123456");
  assert.equal(isCompleteVerificationCode("012345"), true);
  assert.equal(isCompleteVerificationCode("12345"), false);
});
test("resend countdown respects the server's wait", () => {
  assert.equal(cooldownSeconds(601.1), 602);
  assert.equal(formatCooldown(602), "10:02");
  assert.equal(cooldownSeconds(null), 60);
  assert.equal(formatCooldown(-1), "0:00");
});
test("expired and exhausted codes require replacement", () => {
  assert.equal(needsNewCode("code_expired"), true);
  assert.equal(needsNewCode("too_many_attempts"), true);
  assert.equal(needsNewCode("invalid_code"), false);
  assert.equal(attemptsRemaining({ attempts_remaining: 0 }), 0);
  assert.equal(attemptsRemaining({ attempts_remaining: "4" }), null);
});
test("only explicitly unverified accounts see the reminder", () => {
  assert.equal(isEmailUnverified({ email_verified: false }), true);
  for (const user of [null, {}, { email_verified: true }]) assert.equal(isEmailUnverified(user), false);
});
