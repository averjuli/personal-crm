import "server-only";

import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import { signInEmails, verifications } from "@/db/schema";
import { parseEmail } from "@/lib/email-address";
import { sendMail } from "@/lib/mailer";
import { buildSignInEmail } from "@/lib/sign-in-email";

const SIGN_IN_PATH = "/sign-in/magic-link";
const LINK_LIFETIME_SECONDS = 15 * 60;
const EMAIL_LIMIT = 3;
const EMAIL_LIMIT_WINDOW_MS = 10 * 60_000;
const DAY_SECONDS = 24 * 60 * 60;

// Counts the email against the limit "3 per address in 10 minutes". The
// advisory lock makes requests for one address wait for each other, so two
// simultaneous requests cannot both take the last place. Time comes from the
// app (not the database), so tests can move the clock
async function takeEmailSlot(email: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    const since = new Date(Date.now() - EMAIL_LIMIT_WINDOW_MS);
    const [{ value: recent }] = await tx
      .select({ value: count() })
      .from(signInEmails)
      .where(
        and(eq(signInEmails.email, email), gt(signInEmails.sentAt, since)),
      );
    if (recent >= EMAIL_LIMIT) {
      throw new APIError("TOO_MANY_REQUESTS", {
        message: "Too many emails for this address",
        code: "TOO_MANY_EMAILS",
      });
    }
    await tx.insert(signInEmails).values({ email, sentAt: new Date() });
    // Rows outside the window no longer matter
    await tx
      .delete(signInEmails)
      .where(
        and(eq(signInEmails.email, email), lte(signInEmails.sentAt, since)),
      );
  });
}

// A new link cancels the unused links of the same address. Links are rows of
// "verifications": identifier "magic-link:<token>", value is JSON with the
// email. CASE: Postgres may not parse the value of other kinds of rows
async function revokeOldLinks(email: string) {
  await db.delete(verifications).where(
    sql`case when ${verifications.identifier} like 'magic-link:%'
      then ${verifications.value}::jsonb ->> 'email' end = ${email}`,
  );
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  session: {
    // 30 days since the last visit: the term is renewed on a visit, written
    // to the database at most once a day. No cookie cache: sign-out and
    // expiry work at once
    expiresIn: 30 * DAY_SECONDS,
    updateAge: DAY_SECONDS,
    cookieCache: { enabled: false },
  },
  advanced: {
    // nginx sets X-Real-IP itself; X-Forwarded-For can be extended by a client
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },
  hooks: {
    // The only place of the rules for asking a link: the form and a direct
    // request to /api/auth/sign-in/magic-link both go through it
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;

      const parsed = parseEmail(ctx.body?.email);
      if (!parsed.ok) {
        throw new APIError("BAD_REQUEST", {
          message: parsed.error,
          code: "INVALID_EMAIL",
        });
      }

      await takeEmailSlot(parsed.email);
      await revokeOldLinks(parsed.email);

      return {
        context: {
          ...ctx,
          body: {
            ...ctx.body,
            email: parsed.email,
            callbackURL: "/",
            errorCallbackURL: "/login/expired",
          },
        },
      };
    }),
  },
  plugins: [
    magicLink({
      expiresIn: LINK_LIFETIME_SECONDS,
      // A copy of the database must not give working links
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        await sendMail({ to: email, ...buildSignInEmail(url) });
      },
    }),
    // Lets server actions set and clear the session cookie. Keep it last
    nextCookies(),
  ],
});
