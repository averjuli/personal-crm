// «Владелица входит после обновления» and «Другой пользователь после
// обновления» of openspec/specs/data-ownership: the owner is created by
// migration 0003 with a plain insert, not by Better Auth. This checks that such
// a user can sign in by the link like anybody else and sees the old data, and
// that a newcomer sees nothing. The app code (src/db, src/lib/auth) connects to
// the database named in DATABASE_URL when it is imported, so the URL is pointed
// at the updated legacy database before the first import
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "@/db/migrations";

import { testDatabaseUrl } from "../../testing/database";
import { createLegacyDatabase } from "../../testing/legacy-database";

type SentEmail = { to: string; subject: string; html: string; text: string };

const mail = vi.hoisted(() => ({ sent: [] as SentEmail[] }));
vi.mock("@/lib/mailer", () => ({
  sendMail: async (message: SentEmail) => {
    mail.sent.push(message);
  },
}));

const ORIGIN = "http://localhost:3000";
const OWNER = "anna@example.com";
const databaseUrl = testDatabaseUrl("migrated_owner");

let client: postgres.Sql;
let auth: typeof import("@/lib/auth").auth;
let listContacts: typeof import("@/lib/contacts").listContacts;
let listGroups: typeof import("@/lib/contacts").listGroups;
let listNotes: typeof import("@/lib/contacts").listNotes;

// Requests a link for the address, opens it and returns the signed-in user
async function signIn(email: string, ip: string) {
  await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-real-ip": ip,
      },
      body: JSON.stringify({ email }),
    }),
  );
  const url = mail.sent
    .findLast((item) => item.to === email)
    ?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`No link was sent to ${email}`);

  const response = await auth.handler(
    new Request(url, { headers: { "x-real-ip": ip } }),
  );
  expect(new URL(response.headers.get("location")!, ORIGIN).pathname).toBe("/");
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .find((value) => value.includes("session_token"));
  expect(cookie).toBeTruthy();
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookie! }),
  });
  return session!.user;
}

beforeAll(async () => {
  client = await createLegacyDatabase(databaseUrl);
  await applyMigrations(client, OWNER);

  process.env.DATABASE_URL = databaseUrl;
  ({ auth } = await import("@/lib/auth"));
  ({ listContacts, listGroups, listNotes } = await import("@/lib/contacts"));
});

afterAll(async () => {
  const { db } = await import("@/db");
  await db.$client.end();
  await client.end();
});

describe("after the update", () => {
  it("«Владелица входит после обновления»: sees the old contacts, notes and groups", async () => {
    const [created] = await client`select id from users where email = ${OWNER}`;

    const user = await signIn(OWNER, "10.0.0.1");

    // The same user that the migration created, not a second one
    expect(user.id).toBe(created.id);
    const [{ count }] = await client`select count(*)::int as count from users`;
    expect(count).toBe(1);
    const contacts = await listContacts(user.id, "", null);
    expect(contacts.map((row) => row.name).sort()).toEqual([
      "Анна",
      "Борис",
      "Вера",
    ]);
    const notes = await Promise.all(
      contacts.map((row) => listNotes(user.id, row.id)),
    );
    expect(
      notes
        .flat()
        .map((row) => row.body)
        .sort(),
    ).toEqual(["Звонок", "Кофе"]);
    expect((await listGroups(user.id)).map((row) => row.name).sort()).toEqual([
      "Друзья",
      "Теннис",
    ]);
  });

  it("«Другой пользователь после обновления»: an empty list, no old data", async () => {
    const user = await signIn("boris@example.com", "10.0.0.2");

    expect(await listContacts(user.id, "", null)).toEqual([]);
    expect(await listGroups(user.id)).toEqual([]);
  });
});
