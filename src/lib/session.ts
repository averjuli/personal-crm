import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

// The signed-in user of this request, or null. Reads the session from the
// database, not only the cookie
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

// First line of every page with data and of every server action: no session
// means the sign-in page, and nothing below runs. Returns the id of the owner
// of the data to read or change
export async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user.id;
}
