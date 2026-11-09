// Drizzle puts the SQL and its values into the text of a failed query, and
// Postgres adds values to the fields of its error. Next.js and Better Auth log
// the errors they catch as they are, so a failed query is replaced here, where
// it happens, with an error that holds only what went wrong.
import { DrizzleQueryError } from "drizzle-orm";
import { PgPreparedQuery } from "drizzle-orm/pg-core";
import postgres from "postgres";

export class DatabaseError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}
// On the prototype, so the stack and the log say DatabaseError too
DatabaseError.prototype.name = "DatabaseError";

function describeFailure(failure: unknown) {
  const rawCode = (failure as { code?: unknown } | null)?.code;
  const code = typeof rawCode === "string" ? rawCode : "unknown";
  // Only Postgres messages are known to be safe, except class 22 (data
  // exceptions), which quote the rejected value. Other failures, such as a
  // value the driver could not send, may repeat a value, so only their code stays
  const text =
    failure instanceof postgres.PostgresError && !code.startsWith("22")
      ? failure.message
      : "Database query failed";
  return new DatabaseError(`${text} (${code})`, code);
}

// An error that did not come from a query is returned as it is. Checked by
// class, not by name: the production build shortens class names
export function toSafeDatabaseError(error: unknown) {
  if (error instanceof DrizzleQueryError) {
    return describeFailure(error.cause);
  }
  if (error instanceof postgres.PostgresError) {
    return describeFailure(error);
  }
  return error;
}

// Every Drizzle query goes through this method. It is internal, so a new
// Drizzle version may rename it: then the app stops at the start instead of
// logging values again
type QueryRunner = { queryWithCache(...args: unknown[]): Promise<unknown> };
const prototype = PgPreparedQuery.prototype as unknown as QueryRunner;
const runQuery = prototype.queryWithCache;
if (typeof runQuery !== "function") {
  throw new Error(
    "Drizzle has no queryWithCache anymore: update src/db/safe-errors.ts",
  );
}
prototype.queryWithCache = async function (this: unknown, ...args: unknown[]) {
  try {
    return await runQuery.apply(this, args);
  } catch (error) {
    throw toSafeDatabaseError(error);
  }
};
