// Text of the sign-in email. Colors are the design tokens from
// src/app/globals.css written into the styles: mail programs do not read the
// app's CSS (deploy/unavailable.html works the same way)
const colors = {
  background: "#fafaf7",
  foreground: "#111111",
  primary: "#d4f25a",
  mutedForeground: "#55554f",
};

export const SIGN_IN_EMAIL_SUBJECT = "Вход в Личную CRM";
const LINK_LIFETIME_LINE = "Ссылка работает 15 минут.";
const IGNORE_LINE =
  "Если вы не запрашивали вход - просто проигнорируйте письмо";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildSignInEmail(url: string) {
  const href = escapeHtml(url);

  const html = `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:32px 16px;background:${colors.background};font-family:Manrope,Arial,sans-serif;color:${colors.foreground};">
    <div style="max-width:480px;margin:0 auto;">
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;">${SIGN_IN_EMAIL_SUBJECT}</h1>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">Нажми на кнопку, чтобы войти.</p>
      <p style="margin:0 0 24px;">
        <a href="${href}" style="display:inline-block;padding:12px 28px;background:${colors.primary};color:${colors.foreground};border:1.5px solid ${colors.foreground};border-radius:999px;font-size:16px;font-weight:600;text-decoration:none;">Войти</a>
      </p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:${colors.mutedForeground};">${LINK_LIFETIME_LINE}</p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:${colors.mutedForeground};">${IGNORE_LINE}</p>
    </div>
  </body>
</html>`;

  const text = [
    SIGN_IN_EMAIL_SUBJECT,
    "",
    "Чтобы войти, открой ссылку (Войти):",
    url,
    "",
    LINK_LIFETIME_LINE,
    IGNORE_LINE,
  ].join("\n");

  return { subject: SIGN_IN_EMAIL_SUBJECT, html, text };
}
