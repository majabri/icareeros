import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAccount } from "../accountService";

// triggerDataExport uses window.location.href — skip as it has no async path to unit-test.
// Focus on deleteAccount which uses fetch.

function mockFetch(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe("deleteAccount", () => {
  it("returns { deleted: true } on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ deleted: true }));
    const result = await deleteAccount();
    expect(result.deleted).toBe(true);
  });

  it("sends POST to /api/settings/delete-account with confirm: DELETE", async () => {
    const spy = mockFetch({ deleted: true });
    vi.stubGlobal("fetch", spy);
    await deleteAccount();
    expect(spy).toHaveBeenCalledWith(
      "/api/settings/delete-account",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ confirm: "DELETE" }),
      }),
    );
  });

  it("throws on 400 with server error message", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: 'Body must include { "confirm": "DELETE" }' }, 400));
    await expect(deleteAccount()).rejects.toThrow('Body must include');
  });

  it("throws on 401 unauthorised", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "Unauthorised" }, 401));
    await expect(deleteAccount()).rejects.toThrow("Unauthorised");
  });

  it("throws on 500 with a fallback message when no error field", async () => {
    vi.stubGlobal("fetch", mockFetch({}, 500));
    await expect(deleteAccount()).rejects.toThrow("Failed to delete account");
  });
});
