import "server-only";

import { asc, eq, ilike, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts } from "@/db/schema";
import type { ContactInput } from "@/lib/contact-form";

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];

// Escape LIKE wildcards so user input is matched literally
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listContacts(search: string) {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(search ? ilike(contacts.name, `%${escapeLike(search)}%`) : undefined)
    // ICU collation sorts Cyrillic alphabetically (Ё after Е, case-insensitive)
    .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));
}

export async function getContact(id: number) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  return contact;
}

export async function createContact(input: ContactInput) {
  const [created] = await db
    .insert(contacts)
    .values(input)
    .returning({ id: contacts.id });
  return created.id;
}

// Returns false when the contact does not exist
export async function updateContact(id: number, input: ContactInput) {
  const updated = await db
    .update(contacts)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return updated.length > 0;
}

// Returns false when the contact does not exist
export async function deleteContact(id: number) {
  const deleted = await db
    .delete(contacts)
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return deleted.length > 0;
}
