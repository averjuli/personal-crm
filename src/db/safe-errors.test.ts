// A failed database query must reach the log without the values of the query.
// Next.js and Better Auth log the error they catch as it is, so the check looks
// at everything a logger could print: message, stack, cause and hidden fields.
// Real database
import { inspect } from "node:util";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { toSafeDatabaseError } from "@/db/safe-errors";
import { users } from "@/db/schema";

import { truncateAllTables } from "../../testing/database";

const SECRET = "secret-value-of-the-query";

function fullText(error: unknown) {
  return inspect(error, { showHidden: true, depth: null });
}

async function failureOf(query: PromiseLike<unknown>) {
  try {
    await query;
  } catch (error) {
    return error as Error & { code?: string };
  }
  throw new Error("Expected the query to fail");
}

function expectNothingButTheError(error: unknown) {
  const text = fullText(error);
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain("Failed query");
  expect(text).not.toContain("params:");
  expect(text).not.toContain("insert into");
  expect(text).not.toContain("select ");
}

function insertUser(id: string) {
  return db.insert(users).values({ id, name: SECRET, email: SECRET });
}

beforeEach(async () => {
  await db.execute(sql.raw(truncateAllTables));
});

afterAll(async () => {
  await db.execute(sql.raw(truncateAllTables));
});

describe("a failed query", () => {
  it("keeps the error of the database, drops the query and its values", async () => {
    await insertUser("first");

    const error = await failureOf(insertUser("second"));

    expectNothingButTheError(error);
    expect(error.name).toBe("DatabaseError");
    expect(error.code).toBe("23505");
    expect(error.message).toBe(
      'duplicate key value violates unique constraint "users_email_unique" (23505)',
    );
  });

  it("drops the message of the database when it quotes a value", async () => {
    const error = await failureOf(db.execute(sql`select ${SECRET}::int`));

    expectNothingButTheError(error);
    expect(error.code).toBe("22P02");
    expect(error.message).toBe("Database query failed (22P02)");
  });

  it("does the same inside a transaction", async () => {
    const error = await failureOf(
      db.transaction(async (tx) => {
        await tx.execute(sql`select ${SECRET}::int`);
      }),
    );

    expectNothingButTheError(error);
    expect(error.code).toBe("22P02");
  });

  it("gives only the code when the database cannot be reached", async () => {
    const client = postgres(`postgres://crm:${SECRET}@127.0.0.1:1/crm`, {
      max: 1,
      connect_timeout: 2,
    });

    const error = await failureOf(drizzle(client).execute(sql`select 1`));
    await client.end({ timeout: 0 });

    expectNothingButTheError(error);
    expect(error.name).toBe("DatabaseError");
    expect(error.message).toBe(`Database query failed (${error.code})`);
    expect(error.code).toEqual(expect.any(String));
  });
});

describe("toSafeDatabaseError", () => {
  it("cleans an error of a query sent directly through postgres", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });

    const raw = await failureOf(client`select ${SECRET}::int`);
    await client.end();

    expect(fullText(raw)).toContain(SECRET);
    const error = toSafeDatabaseError(raw);
    expectNothingButTheError(error);
    expect(error).toMatchObject({ name: "DatabaseError", code: "22P02" });
  });

  it("recognizes an error of Postgres when the build has shortened its name", async () => {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });

    const raw = await failureOf(client`select * from no_such_table`);
    await client.end();
    raw.name = "c";

    expect(toSafeDatabaseError(raw)).toMatchObject({
      message: 'relation "no_such_table" does not exist (42P01)',
      code: "42P01",
    });
  });

  it("leaves an error that did not come from the database as it is", () => {
    const error = new Error('OWNER_EMAIL is not a valid email address: "x"');

    expect(toSafeDatabaseError(error)).toBe(error);
  });
});
