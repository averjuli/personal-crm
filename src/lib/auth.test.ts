// Scenarios of openspec/changes/login/specs/user-auth/spec.md that concern the
// server: link rules, email rules, rate limit. Real database; only the sending
// of emails is replaced. The clock (Date) is fake, so 15 and 10 minutes pass
// instantly
import { count, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { sessions, signInEmails, users, verifications } from "@/db/schema";

import { truncateAllTables } from "../../testing/database";

type SentEmail = { to: string; subject: string; html: string; text: string };

const mail = vi.hoisted(() => ({ sent: [] as SentEmail[] }));
vi.mock("@/lib/mailer", () => ({
  sendMail: async (message: SentEmail) => {
    mail.sent.push(message);
  },
}));

import { auth } from "@/lib/auth";

const ORIGIN = "http://localhost:3000";
const START = new Date("2026-11-03T10:00:00Z");

function minutes(value: number) {
  return value * 60_000;
}

function days(value: number) {
  return value * 24 * 60 * 60_000;
}

function advance(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms));
}

// Like the form or any other client: POST to the sign-in endpoint
async function requestLink(email: unknown, ip = "10.0.0.1") {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-real-ip": ip,
      },
      body: JSON.stringify({ email }),
    }),
  );
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as {
      status?: boolean;
      code?: string;
    } | null,
  };
}

// The link from the last email sent to this address
function linkSentTo(email: string) {
  const message = mail.sent.findLast((item) => item.to === email);
  if (!message) throw new Error(`No email was sent to ${email}`);
  const url = message.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("No link in the email");
  return url;
}

// Opens a link from an email. Success: redirect to the app with a session
// cookie. Any failure: redirect to /login/expired
async function openLink(url: string) {
  const response = await auth.handler(
    new Request(url, { headers: { "x-real-ip": "10.0.0.2" } }),
  );
  const location = new URL(response.headers.get("location") ?? "", ORIGIN);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .find((value) => value.includes("session_token"));
  return { status: response.status, path: location.pathname, cookie };
}

async function signIn(email: string) {
  await requestLink(email);
  const result = await openLink(linkSentTo(email));
  expect(result.path).toBe("/");
  expect(result.cookie).toBeTruthy();
  return result.cookie!;
}

async function sessionOf(cookie: string) {
  return auth.api.getSession({ headers: new Headers({ cookie }) });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  mail.sent.length = 0;
  await db.execute(sql.raw(truncateAllTables));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requesting a link", () => {
  it("«Ссылка отправлена»: sends an email with a link to the address", async () => {
    const result = await requestLink("anna@example.com");

    expect(result.status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("anna@example.com");
    expect(mail.sent[0].subject).toBe("Вход в Личную CRM");
    expect(linkSentTo("anna@example.com")).toMatch(
      /^http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\?token=/,
    );
  });

  it("«Новая и известная почта неразличимы»", async () => {
    const first = await requestLink("anna@example.com");
    await openLink(linkSentTo("anna@example.com"));
    expect(await db.select().from(users)).toHaveLength(1);

    const known = await requestLink("anna@example.com");
    const unknown = await requestLink("boris@example.com");

    expect(known).toEqual(first);
    expect(unknown).toEqual(first);
    expect(mail.sent.map((item) => item.to)).toEqual([
      "anna@example.com",
      "anna@example.com",
      "boris@example.com",
    ]);
  });

  it("does not create a user until the link is opened", async () => {
    await requestLink("anna@example.com");

    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("stores only a hash of the token", async () => {
    await requestLink("anna@example.com");
    const token = new URL(linkSentTo("anna@example.com")).searchParams.get(
      "token",
    )!;

    const rows = await db.select().from(verifications);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe("email address", () => {
  it("«Другое написание той же почты»: the same user", async () => {
    const first = await signIn("anna@example.com");
    const firstUser = (await sessionOf(first))!.user;

    await requestLink(" Anna@Example.COM ");
    expect(mail.sent.at(-1)!.to).toBe("anna@example.com");
    const second = await openLink(linkSentTo("anna@example.com"));

    expect(second.path).toBe("/");
    expect((await sessionOf(second.cookie!))!.user.id).toBe(firstUser.id);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("«Неверный адрес в прямом запросе»: rejected, no email", async () => {
    for (const email of ["not-an-email", "anna@", "", "   ", 42, null]) {
      const result = await requestLink(email);

      expect(result.status).toBe(400);
      expect(result.body?.code).toBe("INVALID_EMAIL");
    }

    expect(mail.sent).toHaveLength(0);
    expect(await db.select().from(signInEmails)).toHaveLength(0);
    expect(await db.select().from(verifications)).toHaveLength(0);
  });

  it("rejects a request without a body or without an email", async () => {
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    expect(mail.sent).toHaveLength(0);
  });
});

describe("life of a link", () => {
  it("«Вход по ссылке»: a new user is created at the first sign-in", async () => {
    await requestLink("anna@example.com");

    const result = await openLink(linkSentTo("anna@example.com"));

    expect(result.path).toBe("/");
    const session = await sessionOf(result.cookie!);
    expect(session!.user.email).toBe("anna@example.com");
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("«Ссылка открыта второй раз»", async () => {
    await requestLink("anna@example.com");
    const url = linkSentTo("anna@example.com");
    await openLink(url);

    const again = await openLink(url);

    expect(again.path).toBe("/login/expired");
    expect(again.cookie).toBeUndefined();
  });

  it("«Ссылка старше 15 минут»", async () => {
    await requestLink("anna@example.com");
    const url = linkSentTo("anna@example.com");

    advance(minutes(15) + 1000);
    const result = await openLink(url);

    expect(result.path).toBe("/login/expired");
    expect(result.cookie).toBeUndefined();
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("works until the 15th minute", async () => {
    await requestLink("anna@example.com");
    const url = linkSentTo("anna@example.com");

    advance(minutes(14) + 59_000);
    const result = await openLink(url);

    expect(result.path).toBe("/");
    expect(result.cookie).toBeTruthy();
  });

  it("«Старая ссылка после запроса новой»", async () => {
    await requestLink("anna@example.com");
    const first = linkSentTo("anna@example.com");
    await requestLink("anna@example.com");
    const second = linkSentTo("anna@example.com");

    const old = await openLink(first);
    const fresh = await openLink(second);

    expect(old.path).toBe("/login/expired");
    expect(old.cookie).toBeUndefined();
    expect(fresh.path).toBe("/");
    expect(fresh.cookie).toBeTruthy();
  });

  it("«Ссылки других адресов»", async () => {
    await requestLink("anna@example.com");
    const annaLink = linkSentTo("anna@example.com");
    await requestLink("boris@example.com");

    const result = await openLink(annaLink);

    expect(result.path).toBe("/");
    expect((await sessionOf(result.cookie!))!.user.email).toBe(
      "anna@example.com",
    );
  });
});

describe("limit: 3 emails per address in 10 minutes", () => {
  async function requestThree(email = "anna@example.com") {
    for (let i = 0; i < 3; i++) {
      expect((await requestLink(email)).status).toBe(200);
      advance(minutes(1));
    }
  }

  it("«Четвёртое письмо за 10 минут»: refused, no email", async () => {
    await requestThree();

    const fourth = await requestLink("anna@example.com");

    expect(fourth.status).toBe(429);
    expect(fourth.body?.code).toBe("TOO_MANY_EMAILS");
    expect(mail.sent).toHaveLength(3);
  });

  it("a refused request does not touch the links that work", async () => {
    await requestThree();
    const last = linkSentTo("anna@example.com");

    await requestLink("anna@example.com");

    expect((await openLink(last)).path).toBe("/");
  });

  it("«Через 10 минут снова можно»", async () => {
    // Three emails at minutes 0, 1 and 2; now it is minute 3
    await requestThree();

    advance(minutes(7) + 1000);
    const result = await requestLink("anna@example.com");

    expect(result.status).toBe(200);
    expect(mail.sent).toHaveLength(4);
  });

  it("still refused just before 10 minutes after the first email", async () => {
    await requestThree();

    advance(minutes(7) - 1000);

    expect((await requestLink("anna@example.com")).status).toBe(429);
  });

  it("«Другие адреса не страдают»", async () => {
    await requestThree("anna@example.com");

    const result = await requestLink("boris@example.com");

    expect(result.status).toBe(200);
    expect(mail.sent.at(-1)!.to).toBe("boris@example.com");
  });

  it("«Другое написание не обходит лимит»", async () => {
    await requestThree("anna@example.com");

    const result = await requestLink("ANNA@example.com");

    expect(result.status).toBe(429);
    expect(mail.sent).toHaveLength(3);
  });

  it("is not bypassed by simultaneous requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => requestLink("anna@example.com")),
    );

    expect(results.filter((item) => item.status === 200)).toHaveLength(3);
    expect(results.filter((item) => item.status === 429)).toHaveLength(5);
    expect(mail.sent).toHaveLength(3);
    const [{ value }] = await db.select({ value: count() }).from(signInEmails);
    expect(value).toBe(3);
  });

  it("also works for a call from the server, not through HTTP", async () => {
    const send = () =>
      auth.api.signInMagicLink({
        body: { email: "anna@example.com" },
        headers: new Headers(),
      });
    await send();
    await send();
    await send();

    await expect(send()).rejects.toMatchObject({
      status: "TOO_MANY_REQUESTS",
      body: { code: "TOO_MANY_EMAILS" },
    });
  });

  it("removes the old rows of the address", async () => {
    await requestThree();
    advance(minutes(11));

    await requestLink("anna@example.com");

    const [{ value }] = await db.select({ value: count() }).from(signInEmails);
    expect(value).toBe(1);
  });
});

describe("session", () => {
  it("«Вернулся через несколько дней»: still signed in, term renewed", async () => {
    const cookie = await signIn("anna@example.com");

    advance(days(5));

    expect(await sessionOf(cookie)).not.toBeNull();
    const [row] = await db.select().from(sessions);
    // 30 days from today, not from the sign-in day
    expect(
      Math.abs(row.expiresAt.getTime() - (Date.now() + days(30))),
    ).toBeLessThan(minutes(1));
  });

  it("every visit renews the term", async () => {
    const cookie = await signIn("anna@example.com");

    advance(days(20));
    expect(await sessionOf(cookie)).not.toBeNull();
    advance(days(20));

    // 40 days after the sign-in, but 20 after the last visit
    expect(await sessionOf(cookie)).not.toBeNull();
  });

  it("«Не заходил больше 30 дней»: signed out", async () => {
    const cookie = await signIn("anna@example.com");

    advance(days(31));

    expect(await sessionOf(cookie)).toBeNull();
  });

  it("«Два устройства»: both stay signed in", async () => {
    const laptop = await signIn("anna@example.com");
    const phone = await signIn("anna@example.com");

    expect(laptop).not.toBe(phone);
    expect((await sessionOf(laptop))!.user.email).toBe("anna@example.com");
    expect((await sessionOf(phone))!.user.email).toBe("anna@example.com");
  });

  it("«Выход только на этом устройстве»", async () => {
    const laptop = await signIn("anna@example.com");
    const phone = await signIn("anna@example.com");

    await auth.api.signOut({ headers: new Headers({ cookie: laptop }) });

    expect(await sessionOf(laptop)).toBeNull();
    expect(await sessionOf(phone)).not.toBeNull();
  });

  it("a cookie with a forged value is not a session", async () => {
    const cookie = await signIn("anna@example.com");
    const forged = cookie.replace(/=.{5}/, "=AAAAA");

    expect(await sessionOf(forged)).toBeNull();
  });
});
