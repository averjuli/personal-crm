import { z } from "zod";

export const EMAIL_INVALID_MESSAGE = "Проверь адрес почты";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export type ParsedEmail =
  { ok: true; email: string } | { ok: false; error: string };

// One form of every address: no spaces around, lowercase. The sign-in form and
// the server both use it, so users and links always carry the same spelling
export function parseEmail(value: unknown): ParsedEmail {
  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: EMAIL_INVALID_MESSAGE };
  }
  return { ok: true, email: parsed.data };
}
