import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

import { detectGPC } from "../gpc";

describe("detectGPC", () => {
  it("returns false on the server", () => {
    vi.stubGlobal("window", undefined);
    expect(detectGPC()).toBe(false);
  });

  it("returns false when navigator.globalPrivacyControl is undefined", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    expect(detectGPC()).toBe(false);
  });

  it("returns true when navigator.globalPrivacyControl is true", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    expect(detectGPC()).toBe(true);
  });
});
