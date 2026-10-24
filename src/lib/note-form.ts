import { z } from "zod";

import { todayInAppTimeZone } from "@/lib/keep-in-touch";

// YYYY-MM-DD that exists in the calendar (rejects 2026-02-30)
function isRealDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export const noteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Напишите текст заметки")
    .max(20_000, "Не больше 20 000 символов"),
  notedOn: z
    .string()
    .trim()
    .min(1, "Укажите дату")
    .refine(isRealDay, "Укажите дату")
    // Compared as strings: both sides are YYYY-MM-DD
    .refine(
      (value) => !isRealDay(value) || value <= todayInAppTimeZone(),
      "Дата не может быть позже сегодняшней",
    ),
});

export type NoteInput = z.output<typeof noteInputSchema>;
export type NoteField = keyof NoteInput;

// Raw form values echoed back so the form keeps what the user typed
export type NoteFormValues = Record<NoteField, string>;

export type NoteFormState = {
  status: "idle" | "error" | "saved";
  message?: string;
  errors?: Partial<Record<NoteField, string[]>>;
  values?: NoteFormValues;
  savedAt?: string;
};

export function parseNoteForm(formData: FormData) {
  const values = {} as NoteFormValues;
  for (const field of ["body", "notedOn"] as const) {
    const raw = formData.get(field);
    values[field] = typeof raw === "string" ? raw : "";
  }
  const result = noteInputSchema.safeParse(values);
  if (result.success) {
    return { success: true as const, data: result.data };
  }
  const state: NoteFormState = {
    status: "error",
    message: "Проверьте поля, отмеченные красным",
    errors: z.flattenError(result.error).fieldErrors,
    values,
  };
  return { success: false as const, state };
}
