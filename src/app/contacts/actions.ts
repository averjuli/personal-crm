"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import { parseContactForm, type ContactFormState } from "@/lib/contact-form";
import { createContact, deleteContact, updateContact } from "@/lib/contacts";

export async function createContactAction(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = parseContactForm(formData);
  if (!parsed.success) {
    return parsed.state;
  }

  const id = await createContact(parsed.data);

  revalidatePath("/", "layout");
  redirect(`/contacts/${id}?created=1`);
}

export async function updateContactAction(
  id: number,
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Invalid contact id: ${id}`);
  }

  const parsed = parseContactForm(formData);
  if (!parsed.success) {
    return parsed.state;
  }

  const found = await updateContact(id, parsed.data);
  if (!found) {
    return {
      status: "error",
      message: "Этот контакт не найден",
    };
  }

  revalidatePath("/", "layout");
  return { status: "saved", savedAt: new Date().toISOString() };
}

export async function deleteContactAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Invalid contact id: ${id}`);
  }

  // A contact already deleted elsewhere ends the same way: it is gone
  await deleteContact(id);

  revalidatePath("/", "layout");
  // Replace the card in history, so "Back" does not lead to a deleted contact
  redirect("/?deleted=1", RedirectType.replace);
}
