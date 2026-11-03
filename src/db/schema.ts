import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Tables of Better Auth (fields as in the installed version; the adapter maps
// the camelCase property names to these snake_case columns). Ids are text:
// Better Auth generates them
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // Better Auth requires the field; the app never asks for a name
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

// Sign-in links (magic link tokens) live here too
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// One row per sign-in email sent to an address: the rate limit (3 per 10
// minutes) counts these rows
export const signInEmails = pgTable(
  "sign_in_emails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("sign_in_emails_email_sent_at_idx").on(table.email, table.sentAt),
  ],
);

export const contactFrequencies = ["week", "month", "quarter", "year"] as const;
export type ContactFrequency = (typeof contactFrequencies)[number];

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Who this contact belongs to; never changes. No cascade: accounts are
    // never deleted
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
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
    index("contacts_owner_id_idx").on(table.ownerId),
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

export const groups = pgTable(
  "groups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    // Stored as typed; uniqueness ignores case (see the index below)
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("groups_owner_id_idx").on(table.ownerId),
    // "Теннис" and "теннис" are the same group of one user, even for
    // concurrent requests; different users may have the same group name
    uniqueIndex("groups_owner_id_name_lower_idx").on(
      table.ownerId,
      sql`lower(${table.name})`,
    ),
    check(
      "groups_name_check",
      sql`char_length(btrim(${table.name})) between 1 and 50`,
    ),
  ],
);

export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    // The primary key covers lookups by contact; this one serves the group filter
    index("contact_groups_group_id_idx").on(table.groupId),
  ],
);

export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type Group = typeof groups.$inferSelect;
