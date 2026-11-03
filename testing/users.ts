// Users for the tests of the data layer
import { db } from "../src/db";
import { users } from "../src/db/schema";

// A user with this email; returns the id that every data function takes first
export async function createTestUser(email: string) {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, name: "", email });
  return id;
}
