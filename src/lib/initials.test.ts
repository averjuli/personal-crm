import { describe, expect, it } from "vitest";

import { initials } from "@/lib/initials";

describe("initials", () => {
  it("returns a non-empty string for a regular name", () => {
    expect(initials("Анна Смирнова").length).toBeGreaterThan(0);
  });
});
