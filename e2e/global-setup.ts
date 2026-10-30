// Prepares the e2e database before the tests: creates it on the first run,
// applies migrations and leaves only a few known contacts.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contacts } from "@/db/schema";

import { prepareTestDatabase, truncateAllTables } from "../testing/database";
import { e2eDatabaseUrl } from "./database";

// Contacts every test starts with
export const existingContacts = [
  { name: "Анна Смирнова", about: "Коллега по прошлой работе" },
  { name: "Борис Кузнецов", about: "Сосед по даче" },
  { name: "Галина Орлова", about: "Преподаватель английского" },
];

// Leaves only the known contacts; tests that add their own call it afterwards
export async function resetDatabase() {
  const client = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe(truncateAllTables);
    await drizzle(client).insert(contacts).values(existingContacts);
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  await prepareTestDatabase(e2eDatabaseUrl);
  await resetDatabase();
}
