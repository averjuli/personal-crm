// Tests run against their own databases in the same local Postgres, so they
// never touch the contacts in the development database.
import postgres from "postgres";

import { applyMigrations } from "../src/db/migrations";

if (!process.env.DATABASE_URL) {
  process.loadEnvFile();
}

// The database from .env: used only to create the test databases
const adminDatabaseUrl = process.env.DATABASE_URL!;

// Address of the development database with "_<suffix>" added to its name
export function testDatabaseUrl(suffix: string) {
  const url = new URL(adminDatabaseUrl);
  const name = `${url.pathname.slice(1)}_${suffix}`;
  if (!/^[a-z0-9_]+$/i.test(name)) {
    throw new Error(`Unexpected test database name: ${name}`);
  }
  url.pathname = `/${name}`;
  return url.toString();
}

async function createDatabaseIfMissing(name: string) {
  const admin = postgres(adminDatabaseUrl, { max: 1 });
  try {
    const [found] = await admin`
      select 1 from pg_database where datname = ${name}`;
    if (!found) {
      await admin.unsafe(`create database "${name}"`);
    }
  } finally {
    await admin.end();
  }
}

// Not a real address: test databases never hold the owner's email
export const TEST_OWNER_EMAIL = "owner@example.com";

// Drops the database if it exists and creates an empty one
export async function recreateDatabase(databaseUrl: string) {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!/^[a-z0-9_]+$/i.test(name)) {
    throw new Error(`Unexpected test database name: ${name}`);
  }
  const admin = postgres(adminDatabaseUrl, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
}

// Creates the database on the first run and applies the migrations
export async function prepareTestDatabase(databaseUrl: string) {
  await createDatabaseIfMissing(new URL(databaseUrl).pathname.slice(1));

  // Silence "schema already exists, skipping" notices
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await applyMigrations(client, TEST_OWNER_EMAIL);
  } finally {
    await client.end();
  }
}

// Removes every row, so a test starts from an empty database
export const truncateAllTables = `
  truncate users, verifications, contacts, notes, "groups", contact_groups,
  sign_in_emails
  restart identity cascade`;
