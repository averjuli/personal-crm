// Scenarios «Владелица входит после обновления» and «Другой пользователь после
// обновления» of data-ownership. The database is the old one (before sign-in)
// with contacts; migrations are applied, then people sign in with a link, as
// in the app. The app modules are imported anew, on that database
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "@/db/migrations";

import { testDatabaseUrl } from "../../testing/database";
import {
  createLegacyDatabase,
  LEGACY_COUNTS,
} from "../../testing/legacy-database";

const OWNER = "anna@example.com";
const databaseUrl = testDatabaseUrl("update");

type SentEmail = { to: string; text: string };
const mail = vi.hoisted(() => ({ sent: [] as SentEmail[] }));
vi.mock("@/lib/mailer", () => ({
  sendMail: async (message: SentEmail) => {
    mail.sent.push(message);
  },
}));

let app: {
  auth: typeof import("@/lib/auth").auth;
  contacts: typeof import("@/lib/contacts");
  db: typeof import("@/db").db;
};

// Asks for a link, opens it and returns the id of the signed-in user
async function signIn(email: string) {
  await app.auth.api.signInMagicLink({
    body: { email },
    headers: new Headers(),
  });
  const url = mail.sent
    .findLast((item) => item.to === email.trim().toLowerCase())!
    .text.match(/https?:\/\/\S+/)![0];
  const response = await app.auth.handler(new Request(url));
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .find((value) => value.includes("session_token"))!;
  const session = await app.auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  return session!.user.id;
}

beforeAll(async () => {
  const legacy = await createLegacyDatabase(databaseUrl);
  await applyMigrations(legacy, OWNER);
  await legacy.end();

  vi.resetModules();
  vi.stubEnv("DATABASE_URL", databaseUrl);
  const [{ auth }, contacts, { db }] = await Promise.all([
    import("@/lib/auth"),
    import("@/lib/contacts"),
    import("@/db"),
  ]);
  app = { auth, contacts, db };
});

afterAll(async () => {
  await app?.db.$client.end();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("after the update", () => {
  it("«Владелица входит после обновления»: all the old data is hers", async () => {
    const ownerId = await signIn(OWNER);

    const list = await app.contacts.listContacts(ownerId, "", null);
    expect(list.map((row) => row.name).toSorted()).toEqual([
      "Анна",
      "Борис",
      "Вера",
    ]);
    expect(list).toHaveLength(LEGACY_COUNTS.contacts);
    const groups = await app.contacts.listGroups(ownerId);
    expect(groups.map((row) => [row.name, row.contactCount])).toEqual([
      ["Друзья", 2],
      ["Теннис", 1],
    ]);
    const boris = list.find((row) => row.name === "Борис")!;
    expect(boris.groupNames).toEqual(["Друзья", "Теннис"]);
    expect(
      (await app.contacts.listNotes(ownerId, boris.id)).map((n) => n.body),
    ).toEqual(["Звонок"]);
  });

  it("the owner signs in as the user the migration created", async () => {
    const first = await signIn(OWNER);
    const second = await signIn(" ANNA@example.com ");

    expect(second).toBe(first);
  });

  it("«Другой пользователь после обновления»: an empty list", async () => {
    const otherId = await signIn("boris@example.com");

    expect(await app.contacts.listContacts(otherId, "", null)).toEqual([]);
    expect(await app.contacts.listGroups(otherId)).toEqual([]);
    expect(await app.contacts.listOverdueContacts(otherId)).toEqual([]);
  });
});
