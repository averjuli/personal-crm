// Fills an empty database with realistic test contacts of the owner
// (OWNER_EMAIL): `pnpm db:seed`
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { seedContacts } from "./seed-contacts";

async function main() {
  if (!process.env.DATABASE_URL) {
    process.loadEnvFile();
  }
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });

  try {
    const result = await seedContacts(
      drizzle(client, { schema }),
      process.env.OWNER_EMAIL,
    );
    console.log(
      result.skipped
        ? `Seed skipped: the contacts table already has ${result.existing} rows.`
        : `Seed done: inserted ${result.contacts} contacts and ${result.notes} notes.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
