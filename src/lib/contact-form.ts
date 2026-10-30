import { z } from "zod";

import { contactFrequencies } from "@/db/schema";
import { parseGroupIds } from "@/lib/group-form";

// Empty or whitespace-only inputs are stored as NULL
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не больше ${max} символов`)
    .transform((value) => value || null);

export const contactInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(200, "Не больше 200 символов"),
  about: optionalText(500),
  howWeMet: optionalText(500),
  phone: optionalText(50),
  email: z
    .string()
    .trim()
    .max(320, "Не больше 320 символов")
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Похоже, в адресе почты опечатка",
    )
    .transform((value) => value || null),
  // "" is "not set"
  frequency: z
    .enum(["", ...contactFrequencies], "Выберите один из вариантов")
    .transform((value) => value || null),
  // First note of a new contact; the edit form has no such field
  note: optionalText(20_000),
});

type ContactFields = z.output<typeof contactInputSchema>;
export type ContactField = keyof ContactFields;

// The checked groups are not a text field: they come as ids of existing groups
export type ContactInput = ContactFields & { groupIds: number[] };

// Raw form values echoed back so the form keeps what the user typed
export type ContactFormValues = Record<ContactField, string> & {
  groupIds: string[];
};

export type ContactFormState = {
  status: "idle" | "error" | "saved";
  message?: string;
  errors?: Partial<Record<ContactField, string[]>>;
  values?: ContactFormValues;
  savedAt?: string;
};

export const contactFields: ContactField[] = [
  "name",
  "about",
  "howWeMet",
  "phone",
  "email",
  "frequency",
  "note",
];

export function readContactForm(formData: FormData): ContactFormValues {
  const values = {} as ContactFormValues;
  for (const field of contactFields) {
    const raw = formData.get(field);
    values[field] = typeof raw === "string" ? raw : "";
  }
  values.groupIds = formData
    .getAll("groupIds")
    .filter((raw): raw is string => typeof raw === "string");
  return values;
}

export function parseContactForm(formData: FormData) {
  const values = readContactForm(formData);
  const result = contactInputSchema.safeParse(values);
  if (result.success) {
    const data: ContactInput = {
      ...result.data,
      groupIds: parseGroupIds(values.groupIds),
    };
    return { success: true as const, data };
  }
  const state: ContactFormState = {
    status: "error",
    message: "Проверьте поля, отмеченные красным",
    errors: z.flattenError(result.error).fieldErrors,
    values,
  };
  return { success: false as const, state };
}
