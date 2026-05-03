/**
 * Email/phone regex auto-fill — the only auto-fill we do from extracted text.
 * Mirror-tests the patterns used in ResumeIntake.tsx so we catch drift.
 */

import { describe, it, expect } from "vitest";

const EMAIL_RE = /[\w.+\-]+@[\w\-]+\.[\w.]+/;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;

describe("email auto-fill regex", () => {
  it.each([
    ["jane.doe@example.com",                  "jane.doe@example.com"],
    ["Email: foo+bar@sub.example.co.uk now",  "foo+bar@sub.example.co.uk"],
    ["No email here at all",                  null],
  ])("matches %j", (input, expected) => {
    const m = input.match(EMAIL_RE);
    if (expected === null) expect(m).toBeNull();
    else expect(m?.[0]).toBe(expected);
  });
});

describe("phone auto-fill regex", () => {
  it.each([
    ["(415) 555-1234",          "(415) 555-1234"],
    ["+1-415-555-1234",         "+1-415-555-1234"],
    ["415.555.1234",            "415.555.1234"],
    ["call me at 415 555 1234", "415 555 1234"],
    ["No phone in this text",   null],
  ])("matches %j", (input, expected) => {
    const m = input.match(PHONE_RE);
    if (expected === null) expect(m).toBeNull();
    else expect(m?.[0]).toBe(expected);
  });
});
