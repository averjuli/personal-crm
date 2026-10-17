import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";

// Deploy check: 200 when the app is up and the database answers.
// `version` is the git commit the running image was built from.
export async function GET() {
  // Run on every request instead of being prerendered at build time
  await connection();

  const version = process.env.APP_VERSION ?? "dev";
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", version });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ status: "error", version }, { status: 503 });
  }
}
