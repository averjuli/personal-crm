import { describe, expect, it } from "vitest";

import {
  formatContactCount,
  groupNameSchema,
  parseGroupIds,
} from "@/lib/group-form";

function firstError(value: string) {
  const result = groupNameSchema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

describe("groupNameSchema", () => {
  it("trims spaces around the name", () => {
    expect(groupNameSchema.parse("  Теннис  ")).toBe("Теннис");
  });

  it("rejects an empty name", () => {
    expect(firstError("")).toBe("Напишите название группы");
  });

  it("rejects a name of spaces only", () => {
    expect(firstError("   ")).toBe("Напишите название группы");
  });

  it("accepts a name of 50 characters", () => {
    expect(groupNameSchema.parse("а".repeat(50))).toBe("а".repeat(50));
  });

  it("rejects a name of 51 characters", () => {
    expect(firstError("а".repeat(51))).toBe("Не больше 50 символов");
  });

  it("counts the length after trimming", () => {
    expect(groupNameSchema.parse(` ${"а".repeat(50)} `)).toBe("а".repeat(50));
  });
});

describe("parseGroupIds", () => {
  it("turns form values into ids", () => {
    expect(parseGroupIds(["3", "12"])).toEqual([3, 12]);
  });

  it("drops duplicates", () => {
    expect(parseGroupIds(["3", "3", "4"])).toEqual([3, 4]);
  });

  it("drops values that are not ids", () => {
    expect(
      parseGroupIds(["", "abc", "0", "-1", "1.5", "2147483648", "5"]),
    ).toEqual([5]);
  });

  it("returns an empty list when nothing is checked", () => {
    expect(parseGroupIds([])).toEqual([]);
  });
});

describe("formatContactCount", () => {
  it("uses the Russian plural forms", () => {
    expect(formatContactCount(0)).toBe("0 контактов");
    expect(formatContactCount(1)).toBe("1 контакт");
    expect(formatContactCount(2)).toBe("2 контакта");
    expect(formatContactCount(5)).toBe("5 контактов");
    expect(formatContactCount(11)).toBe("11 контактов");
    expect(formatContactCount(21)).toBe("21 контакт");
    expect(formatContactCount(22)).toBe("22 контакта");
  });
});
