// Applies the migrations from ./drizzle. Used by the deploy script
// (src/db/migrate.ts) and by the test databases (testing/database.ts)
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";

import { parseEmail } from "../lib/email-address";

// Migration 0003 reads the owner's email from this Postgres setting. A session
// setting is not an SQL parameter, so the migration SQL can see it
const OWNER_EMAIL_SETTING = "crm.owner_email";

// ownerEmail: address of the user who gets all the existing contacts and
// groups (OWNER_EMAIL). Not set is fine while the database has no contacts or
// groups. A wrong address stops before any change
export async function applyMigrations(
  client: postgres.Sql,
  ownerEmail: string | undefined,
  migrationsFolder = "drizzle",
) {
  let owner = "";
  if (ownerEmail && ownerEmail.trim() !== "") {
    const parsed = parseEmail(ownerEmail);
    if (!parsed.ok) {
      throw new Error(
        `OWNER_EMAIL is not a valid email address: "${ownerEmail}"`,
      );
    }
    owner = parsed.email;
  }

  // The client has one connection (max: 1), so the setting is still there
  // when the migrations run
  await client`select set_config(${OWNER_EMAIL_SETTING}, ${owner}, false)`;
  await migrate(drizzle(client), { migrationsFolder });
}
