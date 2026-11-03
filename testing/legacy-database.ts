// A database as it was before sign-in (migrations up to 0002) with a few
// contacts: the starting point of the "update" scenarios
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import postgres from "postgres";

import { applyMigrations } from "../src/db/migrations";
import { recreateDatabase } from "./database";

// Copy of ./drizzle whose journal ends at 0002
function createOldMigrationsFolder() {
  const folder = mkdtempSync(join(tmpdir(), "crm-old-migrations-"));
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.slice(0, 3);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

export const LEGACY_COUNTS = { contacts: 3, notes: 2, groups: 2, links: 3 };

// Creates the database from scratch: the old schema with 3 contacts, 2 notes,
// 2 groups and 3 links between them. Returns the open connection
export async function createLegacyDatabase(databaseUrl: string) {
  await recreateDatabase(databaseUrl);
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const folder = createOldMigrationsFolder();
  try {
    await applyMigrations(client, undefined, folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  await client`insert into contacts (name) values ('Анна'), ('Борис'), ('Вера')`;
  await client`insert into notes (contact_id, body, noted_on)
    values (1, 'Кофе', '2026-01-01'), (2, 'Звонок', '2026-01-02')`;
  await client`insert into "groups" (name) values ('Друзья'), ('Теннис')`;
  await client`insert into contact_groups (contact_id, group_id)
    values (1, 1), (2, 1), (2, 2)`;
  return client;
}
