// Applies pending migrations from ./drizzle. Runs on the server before every deploy;
// locally `pnpm db:migrate` (drizzle-kit) does the same and keeps the same history table.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// How many migrations the history table (shared with drizzle-kit) lists
async function appliedCount(client: postgres.Sql) {
  const [{ exists }] = await client`
    select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  if (!exists) return 0;
  const [{ count }] = await client`
    select count(*)::int as count from drizzle.__drizzle_migrations`;
  return count as number;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    process.loadEnvFile();
  }
  // Silence "schema already exists, skipping" notices
  const client = postgres(process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {},
  });

  try {
    const before = await appliedCount(client);
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    const after = await appliedCount(client);
    console.log(
      `Migrations: ${after - before} applied now, ${after} in total.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
