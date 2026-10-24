import "server-only";

import { and, asc, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import type { ContactInput } from "@/lib/contact-form";
import { APP_TIME_ZONE } from "@/lib/keep-in-touch";
import type { NoteInput } from "@/lib/note-form";

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];
export type OverdueContact = Awaited<
  ReturnType<typeof listOverdueContacts>
>[number];

// Escape LIKE wildcards so user input is matched literally
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Today in the app time zone; the constant is not user input
const today = sql<string>`(now() at time zone ${sql.raw(`'${APP_TIME_ZONE}'`)})::date`;

// Last communication: the latest of the notes and the "Already contacted" mark.
// greatest() ignores nulls and is null only when both are null
const lastContactOn = sql<
  string | null
// Written by hand: in a single-table query drizzle drops table names from
// columns, and the subquery would compare notes.id with itself
>`greatest((select max(n.noted_on) from notes n where n.contact_id = contacts.id), ${contacts.contactedOn})`;

// The countdown starts from the later of the last communication and the last
// skip; with neither, from the day the frequency was set
const countdownStart = sql`coalesce(greatest(${lastContactOn}, ${contacts.skippedOn}), ${contacts.frequencySetOn})`;

// The day to get in touch; null without a frequency. Postgres clamps a month
// step to the end of a shorter month: 31 Jan + 1 month = 28 Feb
const dueOn = sql<string | null>`(${countdownStart} + case ${contacts.contactFrequency}
  when 'week' then interval '7 days'
  when 'month' then interval '1 month'
  when 'quarter' then interval '3 months'
  when 'year' then interval '1 year'
end)::date`;

// Days past the due day; 0 means "due today"
const overdueDays = sql<number | null>`(${today} - ${dueOn})`;

export async function listContacts(search: string) {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
      frequency: contacts.contactFrequency,
    })
    .from(contacts)
    .where(search ? ilike(contacts.name, `%${escapeLike(search)}%`) : undefined)
    // ICU collation sorts Cyrillic alphabetically (Ё after Е, case-insensitive)
    .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id));
}

// Contacts whose due day has come, the most overdue first
export async function listOverdueContacts() {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      frequency: contacts.contactFrequency,
      overdueDays: sql<number>`${overdueDays}`,
    })
    .from(contacts)
    .where(and(isNotNull(contacts.contactFrequency), sql`${dueOn} <= ${today}`))
    .orderBy(
      asc(dueOn),
      sql`${contacts.name} collate "ru-x-icu"`,
      asc(contacts.id),
    );
}

export async function getContact(id: number) {
  const [contact] = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      howWeMet: contacts.howWeMet,
      phone: contacts.phone,
      email: contacts.email,
      frequency: contacts.contactFrequency,
      lastContactOn,
      dueOn,
      overdueDays,
    })
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  return contact;
}

export async function listNotes(contactId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      notedOn: notes.notedOn,
    })
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.notedOn), desc(notes.id));
}

// The first note and the contact are saved together or not at all
export async function createContact(input: ContactInput) {
  const { frequency, note, ...fields } = input;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contacts)
      .values({
        ...fields,
        contactFrequency: frequency,
        frequencySetOn: frequency ? today : null,
      })
      .returning({ id: contacts.id });
    if (note) {
      await tx
        .insert(notes)
        .values({ contactId: created.id, body: note, notedOn: today });
    }
    return created.id;
  });
}

// Returns false when the contact does not exist
export async function updateContact(
  id: number,
  input: Omit<ContactInput, "note">,
) {
  const { frequency, ...fields } = input;
  const updated = await db
    .update(contacts)
    .set({
      ...fields,
      contactFrequency: frequency,
      // The countdown day is kept when one frequency changes to another and
      // starts today when a frequency is set for the first time. The right
      // side of SET sees the old row
      frequencySetOn: sql`case
        when ${frequency}::text is null then null
        when ${contacts.contactFrequency} is null then ${today}
        else ${contacts.frequencySetOn}
      end`,
      // "Not set" also forgets the skip, otherwise an old skip would move the
      // countdown when a frequency is set again
      skippedOn: sql`case when ${frequency}::text is null then null else ${contacts.skippedOn} end`,
      updatedAt: new Date(),
    })
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

// Returns false when the contact does not exist
export async function addNote(contactId: number, input: NoteInput) {
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .for("share");
    if (!contact) {
      return false;
    }
    await tx.insert(notes).values({ contactId, ...input });
    return true;
  });
}

// Returns false when the note does not exist
export async function updateNote(id: number, input: NoteInput) {
  const updated = await db
    .update(notes)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning({ id: notes.id });
  return updated.length > 0;
}

// Returns false when the note does not exist
export async function deleteNote(id: number) {
  const deleted = await db
    .delete(notes)
    .where(eq(notes.id, id))
    .returning({ id: notes.id });
  return deleted.length > 0;
}

export type KeepInTouchKind = "contacted" | "skipped";

export type KeepInTouchChange = {
  // Values of the field before and after the click, for the undo
  previous: string | null;
  applied: string;
};

const keepInTouchColumns = {
  contacted: contacts.contactedOn,
  skipped: contacts.skippedOn,
} as const;

// Marks today as "Already contacted" or "Skip this time". Returns null when
// the contact does not exist (or, for a skip, has no frequency)
export async function markKeepInTouch(
  id: number,
  kind: KeepInTouchKind,
): Promise<KeepInTouchChange | null> {
  const column = keepInTouchColumns[kind];
  const field = kind === "contacted" ? "contactedOn" : "skippedOn";
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ previous: column })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, id),
          kind === "skipped" ? isNotNull(contacts.contactFrequency) : undefined,
        ),
      )
      .for("update");
    if (!current) {
      return null;
    }
    const [updated] = await tx
      .update(contacts)
      .set({ [field]: today })
      .where(eq(contacts.id, id))
      .returning({ applied: column });
    return { previous: current.previous, applied: updated.applied! };
  });
}

// Restores the previous value only while the field still holds what the click
// set, so an undo never erases a newer mark. Returns whether it restored
export async function undoKeepInTouch(
  id: number,
  kind: KeepInTouchKind,
  change: KeepInTouchChange,
) {
  const column = keepInTouchColumns[kind];
  const field = kind === "contacted" ? "contactedOn" : "skippedOn";
  const restored = await db
    .update(contacts)
    .set({ [field]: change.previous })
    .where(
      and(
        eq(contacts.id, id),
        sql`${column} is not distinct from ${change.applied}::date`,
      ),
    )
    .returning({ id: contacts.id });
  return restored.length > 0;
}
