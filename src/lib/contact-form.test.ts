import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseContactForm } from "@/lib/contact-form";

function form(day = "", month = "", year = "") {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    name: "Anna",
    about: "",
    howWeMet: "",
    phone: "",
    email: "",
    frequency: "",
    note: "",
    birthDay: day,
    birthMonth: month,
    birthYear: year,
  }))
    data.set(name, value);
  return data;
}

describe("birthday form validation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["empty birthday", "", "", "", null, null, null],
    ["unknown birth year", "15", "11", "", 15, 11, null],
    ["complete leap day", "29", "2", "2000", 29, 2, 2000],
    ["leap day without a year", "29", "2", "", 29, 2, null],
    ["today", "16", "11", "2026", 16, 11, 2026],
    ["yesterday", "15", "11", "2026", 15, 11, 2026],
    ["a later month without a year", "22", "12", "", 22, 12, null],
  ] as const)(
    "accepts %s",
    (_name, day, month, year, birthDay, birthMonth, birthYear) => {
      const result = parseContactForm(form(day, month, year));
      expect(result.success).toBe(true);
      if (result.success)
        expect(result.data).toMatchObject({ birthDay, birthMonth, birthYear });
    },
  );

  it.each([
    ["nonexistent day of month", "31", "4", ""],
    ["leap day in a non-leap birth year", "29", "2", "1991"],
    ["non-leap century", "29", "2", "1900"],
    ["day without month", "15", "", ""],
    ["month without day", "", "11", ""],
    ["year without date", "", "", "1990"],
    ["day and year without month", "15", "", "1990"],
    ["month and year without day", "", "11", "1990"],
    ["non-numeric day", "hello", "11", ""],
    ["partially numeric day", "15abc", "11", ""],
    ["fractional day", "1.5", "11", ""],
    ["out of range month", "15", "13", ""],
    ["zero day", "0", "11", ""],
    ["negative year", "15", "11", "-1"],
    ["zero year", "15", "11", "0"],
    ["non-numeric year", "15", "11", "hello"],
    ["partially numeric year", "15", "11", "2025abc"],
    ["fractional year", "15", "11", "2025.5"],
  ])("rejects %s without losing entered values", (_name, day, month, year) => {
    const result = parseContactForm(form(day, month, year));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.errors?.birthDay).toContain(
        "Укажите существующую дату рождения",
      );
      expect(result.state.values).toMatchObject({
        name: "Anna",
        birthDay: day,
        birthMonth: month,
        birthYear: year,
      });
    }
  });

  it.each([
    ["a mistyped five-digit year", "22", "11", "20225"],
    ["next year", "15", "11", "2027"],
    ["a later month this year", "1", "12", "2026"],
    ["tomorrow", "17", "11", "2026"],
  ])("rejects %s without losing entered values", (_name, day, month, year) => {
    const result = parseContactForm(form(day, month, year));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.errors?.birthDay).toContain(
        "Дата рождения не может быть позже сегодняшней",
      );
      expect(result.state.values).toMatchObject({
        name: "Anna",
        birthDay: day,
        birthMonth: month,
        birthYear: year,
      });
    }
  });

  it("uses Moscow's current day and recalculates it after midnight", () => {
    vi.setSystemTime(new Date("2026-11-16T20:59:59Z"));
    expect(parseContactForm(form("17", "11", "2026")).success).toBe(false);

    vi.setSystemTime(new Date("2026-11-16T21:00:00Z"));
    expect(parseContactForm(form("17", "11", "2026")).success).toBe(true);
    expect(parseContactForm(form("18", "11", "2026")).success).toBe(false);
  });
});
