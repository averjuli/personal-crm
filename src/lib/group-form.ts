import { z } from "zod";

import { parseGroupParam } from "@/lib/group-filter";

export const GROUP_NAME_MAX = 50;

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Напишите название группы")
  .max(GROUP_NAME_MAX, `Не больше ${GROUP_NAME_MAX} символов`);

// Checked groups from the form: valid ids only, each once. Anything else was
// not sent by the form and is dropped
export function parseGroupIds(values: string[]): number[] {
  const ids = new Set<number>();
  for (const value of values) {
    const id = parseGroupParam(value);
    if (id !== null) {
      ids.add(id);
    }
  }
  return [...ids];
}

export const GROUP_TAKEN_MESSAGE = "Группа с таким названием уже есть";

// State of a group form on the "Группы" page
export type GroupFormState = {
  status: "idle" | "error" | "saved";
  error?: string;
  // What the user typed, so the field keeps it after an error
  value?: string;
  savedAt?: string;
};

// Result of adding a group from the contact form
export type AddGroupResult =
  | { ok: true; group: { id: number; name: string } }
  | { ok: false; error: string };

const pluralRules = new Intl.PluralRules("ru");

// "1 контакт", "2 контакта", "5 контактов"
export function formatContactCount(count: number) {
  switch (pluralRules.select(count)) {
    case "one":
      return `${count} контакт`;
    case "few":
      return `${count} контакта`;
    default:
      return `${count} контактов`;
  }
}
