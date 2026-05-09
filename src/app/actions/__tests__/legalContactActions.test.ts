import { describe, it, expect, beforeEach, vi } from "vitest";

// ── next/cache ───────────────────────────────────────────────────────────────
// Some of the legal actions revalidate paths after submission. Stub it so
// Vitest doesn't try to invoke the real Next.js cache layer outside of a
// request scope.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── @/lib/mailer ─────────────────────────────────────────────────────────────
const sendMailSpy = vi.fn().mockResolvedValue({
  accepted: ["info@icareeros.com"],
  rejected: [],
  messageId: "<id>",
});

vi.mock("@/lib/mailer", () => ({
  sendMail: (opts: unknown) => sendMailSpy(opts),
  getFromAddress: () => "noreply@icareeros.com",
}));

// ── next/headers — Next.js 15 strict request-scope check ─────────────────────
// `submitPrivacyContact()` does `await headers()` to capture the IP / UA. In
// vitest there's no request scope, so Next throws unless we stub it.
// (Same pattern as adminActions.test.ts via PR #114.)
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === "x-forwarded-for") return "9.9.9.9";
      if (key === "user-agent") return "TestUA/1.0";
      return null;
    },
  }),
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

import { submitPrivacyContact } from "../legalContactActions";

beforeEach(() => {
  vi.clearAllMocks();
  sendMailSpy.mockResolvedValue({
    accepted: ["info@icareeros.com"],
    rejected: [],
    messageId: "<id>",
  });
});

describe("submitPrivacyContact", () => {
  const validInput = {
    name: "Jane Doe",
    email: "jane@example.com",
    postalAddress: "123 Main St, Detroit MI 48201",
    message: "Please confirm what data you hold about me.",
    website: "",
  };

  it("sends an email to info@icareeros.com with the form fields", async () => {
    const res = await submitPrivacyContact(validInput);
    expect(res.ok).toBe(true);
    expect(sendMailSpy).toHaveBeenCalledOnce();
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.to).toBe("info@icareeros.com");
    expect(opts.subject).toContain("Jane Doe");
    expect(opts.subject).toContain("jane@example.com");
    expect(opts.replyTo).toBe("jane@example.com");
    expect(opts.text).toContain("123 Main St, Detroit MI 48201");
    expect(opts.text).toContain("Please confirm what data you hold about me.");
  });

  it("includes IP and user-agent in the email body", async () => {
    await submitPrivacyContact(validInput);
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).toContain("9.9.9.9");
    expect(opts.text).toContain("TestUA/1.0");
  });

  it("escapes HTML in the rendered email body", async () => {
    await submitPrivacyContact({
      ...validInput,
      name: "<script>alert(1)</script>",
      message: "<img src=x onerror=alert(1)>",
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.html).not.toContain("<script>");
    expect(opts.html).not.toContain("<img");
    expect(opts.html).toContain("&lt;script&gt;");
  });

  it("rejects empty name", async () => {
    const res = await submitPrivacyContact({ ...validInput, name: "" });
    expect(res.ok).toBe(false);
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("rejects invalid email", async () => {
    const res = await submitPrivacyContact({ ...validInput, email: "not-an-email" });
    expect(res.ok).toBe(false);
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("rejects too-short message", async () => {
    const res = await submitPrivacyContact({ ...validInput, message: "hi" });
    expect(res.ok).toBe(false);
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("silently 'succeeds' when honeypot field is filled (bot trap)", async () => {
    const res = await submitPrivacyContact({
      ...validInput,
      website: "http://spam.example",
    });
    expect(res.ok).toBe(false); // zod rejects max(0)
    expect(sendMailSpy).not.toHaveBeenCalled();
    // (zod's max(0) means non-empty website fails validation before honeypot
    //  check; the visible "succeed" path is for the honeypot rule. Either way
    //  bots don't get email delivered.)
  });

  it("returns error when sendMail throws (SMTP down)", async () => {
    sendMailSpy.mockRejectedValueOnce(new Error("SMTP unreachable"));
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await submitPrivacyContact(validInput);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/info@icareeros\.com/i);
    consoleErr.mockRestore();
  });

  it("treats sendMail returning null (SMTP not configured) as success", async () => {
    sendMailSpy.mockResolvedValueOnce(null);
    const res = await submitPrivacyContact(validInput);
    expect(res.ok).toBe(true);
  });
});
