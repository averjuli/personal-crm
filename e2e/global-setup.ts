// Prepares the e2e database before the tests: creates it on the first run,
// applies migrations and leaves only a few known contacts.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { contacts } from "@/db/schema";

import { adminDatabaseUrl, e2eDatabaseName, e2eDatabaseUrl } from "./database";

// Contacts every test starts with
export const existingContacts = [
  { name: "Анна Смирнова", about: "Коллега по прошлой работе" },
  { name: "Борис Кузнецов", about: "Сосед по даче" },
  { name: "Галина Орлова", about: "Преподаватель английского" },
];

async function createDatabaseIfMissing() {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const [found] = await admin`
      select 1 from pg_database where datname = ${e2eDatabaseName}`;
    if (!found) {
      await admin.unsafe(`create database "${e2eDatabaseName}"`);
    }
  } finally {
    await admin.end();
  }
}

export default async function globalSetup() {
  await createDatabaseIfMissing();

  // Silence "schema already exists, skipping" notices
  const client = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "drizzle" });
    await client`
      truncate contacts, notes, "groups", contact_groups restart identity cascade`;
    await db.insert(contacts).values(existingContacts);
  } finally {
    await client.end();
  }
}
