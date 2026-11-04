"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { EMAIL_INVALID_MESSAGE, parseEmail } from "@/lib/email-address";
import { TOO_MANY_EMAILS_MESSAGE, type LoginFormState } from "@/lib/login-form";

// «Получить ссылку». The rules (address check, limit, old links) are in the
// hook of src/lib/auth.ts; the form only shows their answer. Checking the
// address here first saves a round trip
export async function requestLinkAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const raw = formData.get("email");
  const value = typeof raw === "string" ? raw : "";
  const parsed = parseEmail(value);
  if (!parsed.ok) {
    return { status: "error", error: parsed.error, value };
  }

  try {
    await auth.api.signInMagicLink({
      body: { email: parsed.email },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      const code = error.body?.code;
      if (code === "TOO_MANY_EMAILS") {
        return { status: "error", error: TOO_MANY_EMAILS_MESSAGE, value };
      }
      if (code === "INVALID_EMAIL") {
        return { status: "error", error: EMAIL_INVALID_MESSAGE, value };
      }
    }
    // Sending failed (e.g. no SMTP): the "Что-то пошло не так" page
    throw error;
  }
  return { status: "sent", sentTo: parsed.email, value };
}

export async function signOutAction() {
  // Ends only the session of this device
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
