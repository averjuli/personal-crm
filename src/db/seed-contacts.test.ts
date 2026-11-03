// Scenario «Демо-данные» of data-ownership: demo contacts go to the owner
import { count, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts, users } from "@/db/schema";
import { seedContacts } from "@/db/seed-contacts";

import { truncateAllTables } from "../../testing/database";

const OWNER = "anna@example.com";

beforeEach(async () => {
  await db.execute(sql.raw(truncateAllTables));
});

async function contactCountOf(email: string) {
  const [row] = await db
    .select({ value: count() })
    .from(contacts)
    .innerJoin(users, eq(contacts.ownerId, users.id))
    .where(eq(users.email, email));
  return row.value;
}

describe("seedContacts", () => {
  it("«Демо-данные»: creates the contacts of the owner, others see none", async () => {
    await db
      .insert(users)
      .values({ id: "other", name: "", email: "boris@example.com" });

    const result = await seedContacts(db, OWNER, { count: 20 });

    expect(result).toMatchObject({ skipped: false, contacts: 20 });
    expect(await contactCountOf(OWNER)).toBe(20);
    expect(await contactCountOf("boris@example.com")).toBe(0);
  });

  it("creates the owner when there is no such user", async () => {
    await seedContacts(db, " Anna@Example.COM ", { count: 5 });

    const rows = await db.select().from(users);
    expect(rows.map((row) => row.email)).toEqual([OWNER]);
  });

  it("uses the user that already has the email", async () => {
    await db.insert(users).values({ id: "anna", name: "", email: OWNER });

    await seedContacts(db, OWNER, { count: 5 });

    expect(await db.select().from(users)).toHaveLength(1);
    const owners = await db
      .selectDistinct({ id: contacts.ownerId })
      .from(contacts);
    expect(owners).toEqual([{ id: "anna" }]);
  });

  it("does nothing when the database already has contacts", async () => {
    await seedContacts(db, OWNER, { count: 5 });

    const result = await seedContacts(db, OWNER, { count: 5 });

    expect(result).toEqual({ skipped: true, existing: 5 });
    expect(await contactCountOf(OWNER)).toBe(5);
  });

  it("fails clearly without OWNER_EMAIL and creates nothing", async () => {
    await expect(seedContacts(db, undefined, { count: 5 })).rejects.toThrow(
      /OWNER_EMAIL is not set/,
    );
    await expect(seedContacts(db, "  ", { count: 5 })).rejects.toThrow(
      /OWNER_EMAIL is not set/,
    );

    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(contacts)).toHaveLength(0);
  });

  it("fails clearly with a wrong OWNER_EMAIL", async () => {
    await expect(
      seedContacts(db, "not-an-email", { count: 5 }),
    ).rejects.toThrow(/OWNER_EMAIL is not a valid email address/);
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
