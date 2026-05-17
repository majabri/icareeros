import { describe, it, expect } from "vitest";
import { parseRoleParam } from "../parseRoleParam";

describe("parseRoleParam", () => {
  it("accepts 'job_seeker'", () => {
    expect(parseRoleParam("job_seeker")).toBe("job_seeker");
  });
  it("accepts 'employer'", () => {
    expect(parseRoleParam("employer")).toBe("employer");
  });
  it("returns undefined for unknown values", () => {
    expect(parseRoleParam("ceo")).toBeUndefined();
    expect(parseRoleParam("admin")).toBeUndefined();
    expect(parseRoleParam("")).toBeUndefined();
  });
  it("returns undefined when the param is missing", () => {
    expect(parseRoleParam(undefined)).toBeUndefined();
  });
  it("takes the first element when given an array (Next.js shape)", () => {
    expect(parseRoleParam(["employer", "job_seeker"])).toBe("employer");
    expect(parseRoleParam(["ceo"])).toBeUndefined();
    expect(parseRoleParam([])).toBeUndefined();
  });
});
