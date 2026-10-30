import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import type { ContactInput } from "@/lib/contact-form";
import { todayInAppTimeZone } from "@/lib/keep-in-touch";
import type { NoteInput } from "@/lib/note-form";

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];
export type OverdueContact = Awaited<
  ReturnType<typeof listOverdueContacts>
>[number];

// Escape LIKE wildcards so user input is matched literally
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Today in the app time zone by the app's clock, not the database's: the
// same day the note form checks against, and tests can set it
function today() {
  return sql<string>`${todayInAppTimeZone()}::date`;
}

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
const dueOn = sql<
  string | null
>`(${countdownStart} + case ${contacts.contactFrequency}
  when 'week' then interval '7 days'
  when 'month' then interval '1 month'
  when 'quarter' then interval '3 months'
  when 'year' then interval '1 year'
end)::date`;

// Days past the due day; 0 means "due today"
function overdueDays() {
  return sql<number | null>`(${today()} - ${dueOn})`;
}

// Names of the contact's groups in alphabetical order (ICU collation, as for
// contact names); an empty array for a contact without groups. Written by
// hand for the same reason as lastContactOn
const groupNames = sql<string[]>`coalesce((
  select array_agg(g.name order by g.name collate "ru-x-icu")
  from contact_groups cg
  join groups g on g.id = cg.group_id
  where cg.contact_id = contacts.id
), '{}')`;

// The search matches a name or a group name; the group filter narrows the
// result further. Either part may be absent
export async function listContacts(search: string, groupId: number | null) {
  const pattern = `%${escapeLike(search)}%`;
  return (
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        about: contacts.about,
        phone: contacts.phone,
        email: contacts.email,
        frequency: contacts.contactFrequency,
        groupNames,
      })
      .from(contacts)
      .where(
        and(
          search
            ? or(
                ilike(contacts.name, pattern),
                sql`exists (
                select 1 from contact_groups cg
                join groups g on g.id = cg.group_id
                where cg.contact_id = contacts.id and g.name ilike ${pattern}
              )`,
              )
            : undefined,
          groupId !== null
            ? sql`exists (
              select 1 from contact_groups cg
              where cg.contact_id = contacts.id and cg.group_id = ${groupId}
            )`
            : undefined,
        ),
      )
      // ICU collation sorts Cyrillic alphabetically (Ё after Е, case-insensitive)
      .orderBy(sql`${contacts.name} collate "ru-x-icu"`, asc(contacts.id))
  );
}

// Contacts whose due day has come, the most overdue first
export async function listOverdueContacts() {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      frequency: contacts.contactFrequency,
      overdueDays: sql<number>`${overdueDays()}`,
    })
    .from(contacts)
    .where(
      and(isNotNull(contacts.contactFrequency), sql`${dueOn} <= ${today()}`),
    )
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
      overdueDays: overdueDays(),
    })
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  if (!contact) {
    return undefined;
  }
  const memberships = await db
    .select({ groupId: contactGroups.groupId })
    .from(contactGroups)
    .where(eq(contactGroups.contactId, id));
  return { ...contact, groupIds: memberships.map((row) => row.groupId) };
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
  const { frequency, note, groupIds, ...fields } = input;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contacts)
      .values({
        ...fields,
        contactFrequency: frequency,
        frequencySetOn: frequency ? today() : null,
      })
      .returning({ id: contacts.id });
    if (note) {
      await tx
        .insert(notes)
        .values({ contactId: created.id, body: note, notedOn: today() });
    }
    await setContactGroups(tx, created.id, groupIds);
    return created.id;
  });
}

// Returns false when the contact does not exist
export async function updateContact(
  id: number,
  input: Omit<ContactInput, "note">,
) {
  const { frequency, groupIds, ...fields } = input;
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(contacts)
      .set({
        ...fields,
        contactFrequency: frequency,
        // The countdown day is kept when one frequency changes to another and
        // starts today when a frequency is set for the first time. The right
        // side of SET sees the old row
        frequencySetOn: sql`case
          when ${frequency}::text is null then null
          when ${contacts.contactFrequency} is null then ${today()}
          else ${contacts.frequencySetOn}
        end`,
        // "Not set" also forgets the skip, otherwise an old skip would move the
        // countdown when a frequency is set again
        skippedOn: sql`case when ${frequency}::text is null then null else ${contacts.skippedOn} end`,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });
    if (updated.length === 0) {
      return false;
    }
    await setContactGroups(tx, id, groupIds);
    return true;
  });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Makes the contact's groups exactly the given ones. Ids of groups deleted in
// the meantime are skipped instead of failing the whole save
async function setContactGroups(
  tx: Transaction,
  contactId: number,
  groupIds: number[],
) {
  const existing = groupIds.length
    ? (
        await tx
          .select({ id: groups.id })
          .from(groups)
          .where(inArray(groups.id, groupIds))
      ).map((row) => row.id)
    : [];
  await tx
    .delete(contactGroups)
    .where(
      and(
        eq(contactGroups.contactId, contactId),
        existing.length
          ? notInArray(contactGroups.groupId, existing)
          : undefined,
      ),
    );
  if (existing.length) {
    await tx
      .insert(contactGroups)
      .values(existing.map((groupId) => ({ contactId, groupId })))
      .onConflictDoNothing();
  }
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

export type GroupListItem = Awaited<ReturnType<typeof listGroups>>[number];

// All groups alphabetically, each with the number of its contacts
export async function listGroups() {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      contactCount: sql<number>`count(${contactGroups.contactId})::int`,
    })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .groupBy(groups.id)
    .orderBy(sql`${groups.name} collate "ru-x-icu"`, asc(groups.id));
}

// Postgres error 23505; drizzle wraps the driver error, so look at its cause too
function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// Creates the group, or returns the existing one with the same name ignoring
// case. Never fails on a duplicate, even when two requests race
export async function createGroup(name: string) {
  const [created] = await db
    .insert(groups)
    .values({ name })
    .onConflictDoNothing()
    .returning({ id: groups.id, name: groups.name });
  if (created) {
    return created;
  }
  const [existing] = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(sql`lower(${groups.name}) = lower(${name})`)
    .limit(1);
  if (!existing) {
    throw new Error("The group was deleted while it was being created");
  }
  return existing;
}

export type RenameGroupResult = "renamed" | "not-found" | "taken";

// A case-only change passes: the unique index compares the row with itself
export async function renameGroup(
  id: number,
  name: string,
): Promise<RenameGroupResult> {
  try {
    const updated = await db
      .update(groups)
      .set({ name })
      .where(eq(groups.id, id))
      .returning({ id: groups.id });
    return updated.length > 0 ? "renamed" : "not-found";
  } catch (error) {
    if (isUniqueViolation(error)) {
      return "taken";
    }
    throw error;
  }
}

// Contacts keep everything else; only their links to the group go away.
// Returns false when the group does not exist
export async function deleteGroup(id: number) {
  const deleted = await db
    .delete(groups)
    .where(eq(groups.id, id))
    .returning({ id: groups.id });
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
      .set({ [field]: today() })
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
