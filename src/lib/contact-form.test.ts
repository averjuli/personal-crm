import { describe, expect, it } from "vitest";

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
  it.each([
    ["empty birthday", "", "", "", null, null, null],
    ["unknown birth year", "15", "11", "", 15, 11, null],
    ["complete leap day", "29", "2", "2000", 29, 2, 2000],
    ["leap day without a year", "29", "2", "", 29, 2, null],
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
});
