import { describe, it, expect } from "vitest";
import { arr, str, num, obj } from "../normalize";

describe("normalize helpers", () => {
  describe("arr", () => {
    it("returns the value when it's an array", () => {
      expect(arr<string>(["a", "b"])).toEqual(["a", "b"]);
      expect(arr<number>([1, 2, 3])).toEqual([1, 2, 3]);
      expect(arr<unknown>([])).toEqual([]);
    });
    it("returns [] for non-arrays", () => {
      expect(arr<string>(null)).toEqual([]);
      expect(arr<string>(undefined)).toEqual([]);
      expect(arr<string>(0)).toEqual([]);
      expect(arr<string>("")).toEqual([]);
      expect(arr<string>({})).toEqual([]);
      expect(arr<string>({ length: 3 })).toEqual([]);   // not a real array
    });
  });

  describe("str", () => {
    it("returns the value when it's a string", () => {
      expect(str("hello")).toBe("hello");
      expect(str("")).toBe("");
    });
    it("returns fallback for non-strings", () => {
      expect(str(undefined, "x")).toBe("x");
      expect(str(null, "x")).toBe("x");
      expect(str(42, "x")).toBe("x");
      expect(str({}, "x")).toBe("x");
    });
    it("defaults to empty string", () => {
      expect(str(undefined)).toBe("");
    });
  });

  describe("num", () => {
    it("returns the value when it's a finite number", () => {
      expect(num(42)).toBe(42);
      expect(num(0)).toBe(0);
      expect(num(-7.5)).toBe(-7.5);
    });
    it("returns fallback for non-finite numbers", () => {
      expect(num(NaN, 99)).toBe(99);
      expect(num(Infinity, 99)).toBe(99);
      expect(num(-Infinity, 99)).toBe(99);
    });
    it("returns fallback for non-numbers", () => {
      expect(num(undefined, 5)).toBe(5);
      expect(num(null, 5)).toBe(5);
      expect(num("42", 5)).toBe(5);
      expect(num([], 5)).toBe(5);
    });
    it("defaults to 0", () => {
      expect(num(undefined)).toBe(0);
    });
  });

  describe("obj", () => {
    it("returns the value when it's a non-null object", () => {
      expect(obj({ a: 1 })).toEqual({ a: 1 });
      expect(obj({})).toEqual({});
    });
    it("returns {} for non-objects, arrays, and null", () => {
      expect(obj(null)).toEqual({});
      expect(obj(undefined)).toEqual({});
      expect(obj([1, 2])).toEqual({});      // arrays excluded
      expect(obj("hello")).toEqual({});
      expect(obj(42)).toEqual({});
    });
  });
});
