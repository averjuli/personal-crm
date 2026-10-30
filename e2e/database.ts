// e2e tests run against their own database in the same local Postgres, so they
// never touch the contacts in the development database.

if (!process.env.DATABASE_URL) {
  process.loadEnvFile();
}

// The database from .env: used only to create the e2e database
export const adminDatabaseUrl = process.env.DATABASE_URL!;

const url = new URL(adminDatabaseUrl);
export const e2eDatabaseName = `${url.pathname.slice(1)}_e2e`;

if (!/^[a-z0-9_]+$/i.test(e2eDatabaseName)) {
  throw new Error(`Unexpected e2e database name: ${e2eDatabaseName}`);
}

url.pathname = `/${e2eDatabaseName}`;
export const e2eDatabaseUrl = url.toString();
