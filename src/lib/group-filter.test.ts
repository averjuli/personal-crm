import { describe, expect, it } from "vitest";

import { parseGroupParam } from "@/lib/group-filter";

describe("parseGroupParam", () => {
  it("returns the id for a number", () => {
    expect(parseGroupParam("7")).toBe(7);
  });

  it("returns null for garbage", () => {
    expect(parseGroupParam("abc")).toBeNull();
    expect(parseGroupParam("7abc")).toBeNull();
    expect(parseGroupParam("1.5")).toBeNull();
  });

  it("returns null for an empty or missing value", () => {
    expect(parseGroupParam("")).toBeNull();
    expect(parseGroupParam(undefined)).toBeNull();
  });

  it("returns null for zero and negative numbers", () => {
    expect(parseGroupParam("0")).toBeNull();
    expect(parseGroupParam("-3")).toBeNull();
  });

  it("returns null for a number beyond the integer column", () => {
    expect(parseGroupParam("2147483647")).toBe(2147483647);
    expect(parseGroupParam("2147483648")).toBeNull();
    expect(parseGroupParam("99999999999999999999")).toBeNull();
  });

  it("takes the first value when the parameter is repeated", () => {
    expect(parseGroupParam(["4", "5"])).toBe(4);
  });
});
