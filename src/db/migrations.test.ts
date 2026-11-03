// Migration 0003 on a copy of the old schema (up to 0002) filled with data:
// every contact and group must move to the owner, nothing may get lost
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "@/db/migrations";

import { TEST_OWNER_EMAIL, testDatabaseUrl } from "../../testing/database";
import {
  createLegacyDatabase,
  LEGACY_COUNTS,
} from "../../testing/legacy-database";

const databaseUrl = testDatabaseUrl("migration");
const OWNER = "anna@example.com";

let client: postgres.Sql;

async function counts() {
  const [row] = await client`
    select
      (select count(*)::int from contacts) as contacts,
      (select count(*)::int from notes) as notes,
      (select count(*)::int from "groups") as groups,
      (select count(*)::int from contact_groups) as links`;
  return { ...row };
}

async function migrationsApplied() {
  const [{ count }] = await client`
    select count(*)::int as count from drizzle.__drizzle_migrations`;
  return count as number;
}

async function tableExists(name: string) {
  const [{ exists }] = await client`
    select to_regclass(${name}) is not null as exists`;
  return exists as boolean;
}

beforeEach(async () => {
  await client?.end();
  client = await createLegacyDatabase(databaseUrl);
});

afterAll(async () => {
  await client?.end();
});

describe("migration 0003", () => {
  it("«Данные после обновления»: moves everything to the owner, loses nothing", async () => {
    const before = await counts();
    expect(before).toEqual(LEGACY_COUNTS);

    await applyMigrations(client, OWNER);

    expect(await counts()).toEqual(before);
    const users = await client`select id, email from users`;
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe(OWNER);
    const owners = await client`
      select owner_id from contacts
      union select owner_id from "groups"`;
    expect(owners.map((row) => row.owner_id)).toEqual([users[0].id]);
  });

  it("writes the owner's email in one form", async () => {
    await applyMigrations(client, "  Anna@Example.COM ");

    const users = await client`select email from users`;
    expect(users.map((row) => row.email)).toEqual([OWNER]);
  });

  it("«Нет настройки владелицы»: stops with an error and changes nothing", async () => {
    const before = await counts();
    const applied = await migrationsApplied();

    await expect(applyMigrations(client, undefined)).rejects.toThrow(
      /OWNER_EMAIL/,
    );

    expect(await counts()).toEqual(before);
    expect(await migrationsApplied()).toBe(applied);
    expect(await tableExists("users")).toBe(false);
    const columns = await client`
      select 1 from information_schema.columns
      where table_name = 'contacts' and column_name = 'owner_id'`;
    expect(columns).toHaveLength(0);
  });

  it("«Нет настройки владелицы»: an empty setting is the same as no setting", async () => {
    await expect(applyMigrations(client, "   ")).rejects.toThrow(/OWNER_EMAIL/);
    expect(await tableExists("users")).toBe(false);
  });

  it("«Пустая база без настройки»: passes, no users are created", async () => {
    await client`truncate contacts, notes, "groups", contact_groups restart identity cascade`;

    await applyMigrations(client, undefined);

    expect(await tableExists("users")).toBe(true);
    const [{ count }] = await client`select count(*)::int as count from users`;
    expect(count).toBe(0);
  });

  it("an invalid email stops before any change", async () => {
    const before = await counts();
    const applied = await migrationsApplied();

    await expect(applyMigrations(client, "not-an-email")).rejects.toThrow(
      /OWNER_EMAIL/,
    );

    expect(await counts()).toEqual(before);
    expect(await migrationsApplied()).toBe(applied);
    expect(await tableExists("users")).toBe(false);
  });

  it("after the update contacts and groups cannot be left without an owner", async () => {
    await applyMigrations(client, TEST_OWNER_EMAIL);

    await expect(
      client`insert into contacts (name) values ('Без владельца')`,
    ).rejects.toThrow(/owner_id/);
    await expect(
      client`insert into "groups" (name) values ('Без владельца')`,
    ).rejects.toThrow(/owner_id/);
  });

  it("group names are unique per owner, not across the system", async () => {
    await applyMigrations(client, OWNER);
    const [other] = await client`
      insert into users (id, name, email) values ('other', '', 'boris@example.com')
      returning id`;
    const [owner] = await client`select id from users where email = ${OWNER}`;

    await client`insert into "groups" (owner_id, name) values (${other.id}, 'друзья')`;
    await expect(
      client`insert into "groups" (owner_id, name) values (${owner.id}, 'ТЕННИС')`,
    ).rejects.toThrow(/groups_owner_id_name_lower_idx/);
  });
});
