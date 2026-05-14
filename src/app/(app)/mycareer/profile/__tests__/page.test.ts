import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PAGE_PATH = resolve(__dirname, "..", "page.tsx");

describe("/mycareer/profile save form behavior", () => {
  it("disables browser-native form validation so submit handler always runs", () => {
    const src = readFileSync(PAGE_PATH, "utf-8");
    expect(src).toContain("<form noValidate onSubmit={e => void handleSaveProfile(e)}>");
  });

  it("shows a user-facing error instead of silently no-op when auth is missing", () => {
    const src = readFileSync(PAGE_PATH, "utf-8");
    expect(src).toContain('setProfileMsg({ type: "error", text: "Please sign in again and retry." });');
  });
});
