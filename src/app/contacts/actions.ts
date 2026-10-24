"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";

import { parseContactForm, type ContactFormState } from "@/lib/contact-form";
import {
  addNote,
  createContact,
  deleteContact,
  deleteNote,
  markKeepInTouch,
  undoKeepInTouch,
  updateContact,
  updateNote,
  type KeepInTouchChange,
  type KeepInTouchKind,
} from "@/lib/contacts";
import { parseNoteForm, type NoteFormState } from "@/lib/note-form";

function assertId(id: number, what: string) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Invalid ${what} id: ${id}`);
  }
}

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
  assertId(id, "contact");

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
  assertId(id, "contact");

  // A contact already deleted elsewhere ends the same way: it is gone
  await deleteContact(id);

  revalidatePath("/", "layout");
  // Replace the card in history, so "Back" does not lead to a deleted contact
  redirect("/?deleted=1", RedirectType.replace);
}

export async function addNoteAction(
  contactId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  assertId(contactId, "contact");

  const parsed = parseNoteForm(formData);
  if (!parsed.success) {
    return parsed.state;
  }

  const found = await addNote(contactId, parsed.data);
  if (!found) {
    return { status: "error", message: "Этот контакт не найден" };
  }

  revalidatePath("/", "layout");
  return { status: "saved", savedAt: new Date().toISOString() };
}

export async function updateNoteAction(
  noteId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  assertId(noteId, "note");

  const parsed = parseNoteForm(formData);
  if (!parsed.success) {
    return parsed.state;
  }

  const found = await updateNote(noteId, parsed.data);
  if (!found) {
    return { status: "error", message: "Эта заметка не найдена" };
  }

  revalidatePath("/", "layout");
  return { status: "saved", savedAt: new Date().toISOString() };
}

export async function deleteNoteAction(noteId: number) {
  assertId(noteId, "note");

  // A note already deleted elsewhere ends the same way: it is gone
  await deleteNote(noteId);

  revalidatePath("/", "layout");
}

export type KeepInTouchResult =
  | { ok: true; change: KeepInTouchChange }
  | { ok: false; message: string };

async function markAction(
  contactId: number,
  kind: KeepInTouchKind,
): Promise<KeepInTouchResult> {
  assertId(contactId, "contact");

  const change = await markKeepInTouch(contactId, kind);
  if (!change) {
    return { ok: false, message: "Этот контакт не найден" };
  }

  revalidatePath("/", "layout");
  return { ok: true, change };
}

export async function markContactedAction(contactId: number) {
  return markAction(contactId, "contacted");
}

export async function skipContactAction(contactId: number) {
  return markAction(contactId, "skipped");
}

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

// Gives the contact back its value from before the click. It does nothing when
// a newer mark has replaced the one set by the click
export async function undoKeepInTouchAction(
  contactId: number,
  kind: KeepInTouchKind,
  change: KeepInTouchChange,
) {
  assertId(contactId, "contact");
  if (kind !== "contacted" && kind !== "skipped") {
    throw new Error(`Invalid kind: ${kind}`);
  }
  if (
    !dayPattern.test(change.applied) ||
    (change.previous !== null && !dayPattern.test(change.previous))
  ) {
    throw new Error("Invalid day in undo request");
  }

  await undoKeepInTouch(contactId, kind, change);

  revalidatePath("/", "layout");
}
