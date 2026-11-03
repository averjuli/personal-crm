// Prepares the e2e database before the tests: creates it on the first run,
// applies migrations and leaves the test user with a few known contacts.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contacts, users } from "@/db/schema";

import { prepareTestDatabase, truncateAllTables } from "../testing/database";
import { e2eDatabaseUrl } from "./database";
import { e2eUser } from "./test-user";

// Contacts every test starts with
export const existingContacts = [
  { name: "Анна Смирнова", about: "Коллега по прошлой работе" },
  { name: "Борис Кузнецов", about: "Сосед по даче" },
  { name: "Галина Орлова", about: "Преподаватель английского" },
];

// Leaves only the known contacts of the test user; tests that add their own
// call it afterwards. Users and their sessions stay, so the saved session of
// the test user keeps working
export async function resetDatabase() {
  const client = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe(
      `truncate contacts, notes, "groups", contact_groups restart identity cascade`,
    );
    await drizzle(client)
      .insert(contacts)
      .values(
        existingContacts.map((contact) => ({
          ...contact,
          ownerId: e2eUser.id,
        })),
      );
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  await prepareTestDatabase(e2eDatabaseUrl);

  // A clean start: no users, sessions or links of earlier runs
  const client = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe(truncateAllTables);
    await drizzle(client)
      .insert(users)
      .values({ id: e2eUser.id, name: "", email: e2eUser.email });
  } finally {
    await client.end();
  }
  await resetDatabase();
}
