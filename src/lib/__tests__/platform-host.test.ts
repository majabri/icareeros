import { describe, it, expect } from "vitest";
import {
  isProductionHost,
  platformFromHost,
  type Platform,
} from "../platform-host";

describe("platformFromHost", () => {
  it("maps jobs.icareeros.com → 'jobs'", () => {
    expect(platformFromHost("jobs.icareeros.com")).toBe<Platform>("jobs");
  });

  it("maps hire.icareeros.com → 'hire'", () => {
    expect(platformFromHost("hire.icareeros.com")).toBe<Platform>("hire");
  });

  it("maps icareeros.com → 'root'", () => {
    expect(platformFromHost("icareeros.com")).toBe<Platform>("root");
  });

  it("maps www.icareeros.com → 'root'", () => {
    expect(platformFromHost("www.icareeros.com")).toBe<Platform>("root");
  });

  it("maps preview vercel.app hosts to 'root'", () => {
    expect(platformFromHost("icareeros-git-feat-subdomain-jabri-solutions.vercel.app")).toBe<Platform>("root");
  });

  it("maps localhost dev to 'root'", () => {
    expect(platformFromHost("localhost:3000")).toBe<Platform>("root");
  });

  it("includes ports/casing in matching (subdomain prefix only)", () => {
    // hostnames are lowercase per HTTP spec; this is just defensive
    expect(platformFromHost("jobs.icareeros.com:3000")).toBe<Platform>("jobs");
  });
});

describe("isProductionHost", () => {
  it("true for icareeros.com", () => {
    expect(isProductionHost("icareeros.com")).toBe(true);
  });
  it("true for any *.icareeros.com host", () => {
    expect(isProductionHost("jobs.icareeros.com")).toBe(true);
    expect(isProductionHost("hire.icareeros.com")).toBe(true);
    expect(isProductionHost("www.icareeros.com")).toBe(true);
  });
  it("false for vercel.app preview hosts", () => {
    expect(isProductionHost("icareeros-git-feat-x-jabri-solutions.vercel.app")).toBe(false);
  });
  it("false for localhost", () => {
    expect(isProductionHost("localhost:3000")).toBe(false);
  });
});
