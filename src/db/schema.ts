import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const contactFrequencies = ["week", "month", "quarter", "year"] as const;
export type ContactFrequency = (typeof contactFrequencies)[number];

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    // Who this person is: role, relation, short description
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    // Deprecated: replaced by the notes table, kept only so that a manual
    // rollback to the previous image still works. Not read or written by new code
    notes: text("notes"),
    // How often to stay in touch; null means "not set"
    contactFrequency: text("contact_frequency", { enum: contactFrequencies }),
    // Day the frequency was set; the countdown starts here when there is
    // no contact or skip yet
    frequencySetOn: date("frequency_set_on", { mode: "string" }),
    // Day of the last "Already contacted" mark (without a note)
    contactedOn: date("contacted_on", { mode: "string" }),
    // Day of the last "Skip this time"
    skippedOn: date("skipped_on", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "contacts_contact_frequency_check",
      sql`${table.contactFrequency} in ('week', 'month', 'quarter', 'year')`,
    ),
    check(
      "contacts_frequency_set_on_check",
      sql`(${table.contactFrequency} is null) = (${table.frequencySetOn} is null)`,
    ),
    check(
      "contacts_skipped_on_check",
      sql`${table.skippedOn} is null or ${table.contactFrequency} is not null`,
    ),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // Calendar day of the communication, as YYYY-MM-DD
    notedOn: date("noted_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notes_contact_id_noted_on_idx").on(
      table.contactId,
      table.notedOn.desc(),
      table.id.desc(),
    ),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
