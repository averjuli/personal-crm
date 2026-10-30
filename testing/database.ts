// Tests run against their own databases in the same local Postgres, so they
// never touch the contacts in the development database.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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

// Creates the database on the first run and applies the migrations
export async function prepareTestDatabase(databaseUrl: string) {
  await createDatabaseIfMissing(new URL(databaseUrl).pathname.slice(1));

  // Silence "schema already exists, skipping" notices
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } finally {
    await client.end();
  }
}

// Removes every row, so a test starts from an empty database
export const truncateAllTables = `
  truncate contacts, notes, "groups", contact_groups restart identity cascade`;
