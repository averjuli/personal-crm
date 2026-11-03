import { describe, expect, it } from "vitest";

import { buildSignInEmail } from "@/lib/sign-in-email";

const url = "https://app.example.com/api/auth/magic-link/verify?token=abc&x=1";

describe("buildSignInEmail", () => {
  it("has the subject «Вход в Личную CRM»", () => {
    expect(buildSignInEmail(url).subject).toBe("Вход в Личную CRM");
  });

  it("has a «Войти» button with the link in the HTML", () => {
    const { html } = buildSignInEmail(url);
    expect(html).toMatch(
      /<a [^>]*href="https:\/\/app\.example\.com\/api\/auth\/magic-link\/verify\?token=abc&amp;x=1"[^>]*>\s*Войти\s*<\/a>/,
    );
  });

  it("escapes the link in the HTML", () => {
    const { html } = buildSignInEmail('https://x.example/?a="b"&c=<d>');
    expect(html).toContain("&quot;b&quot;");
    expect(html).toContain("&lt;d&gt;");
    expect(html).not.toContain('"b"');
    expect(html).not.toContain("<d>");
  });

  it("says the link works for 15 minutes", () => {
    const { html, text } = buildSignInEmail(url);
    expect(html).toContain("Ссылка работает 15 минут");
    expect(text).toContain("Ссылка работает 15 минут");
  });

  it("asks to ignore the email if the sign-in was not requested", () => {
    const { html, text } = buildSignInEmail(url);
    const line = "Если вы не запрашивали вход - просто проигнорируйте письмо";
    expect(html).toContain(line);
    expect(text).toContain(line);
  });

  it("has the link and the same lines in the text version", () => {
    const { text } = buildSignInEmail(url);
    expect(text).toContain("Войти");
    expect(text).toContain(url);
  });
});
