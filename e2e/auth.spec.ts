// Main user paths of openspec/changes/login/specs/user-auth (and the first sign-in
// of data-ownership). The rules behind them are checked in src/lib/auth.test.ts
import { type Page } from "@playwright/test";
import { expect, newBrowserContext, test } from "./fixtures";
import postgres from "postgres";

import { e2eDatabaseUrl } from "./database";
import { openMailbox, uniqueEmail } from "./mailpit";
import { requestLink, signIn } from "./sign-in";
import { e2eUser, signedOut } from "./test-user";

async function withDatabase<T>(work: (sql: postgres.Sql) => Promise<T>) {
  const client = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => {} });
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

const sentMessage = (page: Page, email: string) =>
  page.getByText(`Ссылка для входа отправлена на ${email}`);

const loginForm = (page: Page) => ({
  field: page.getByRole("textbox", { name: "Почта" }),
  button: page.getByRole("button", { name: "Получить ссылку" }),
});

async function expectLoginPage(page: Page) {
  await expect(page).toHaveURL(/\/login$/);
  await expect(loginForm(page).field).toBeVisible();
  await expect(loginForm(page).button).toBeVisible();
}

test.describe("without sign-in", () => {
  test.use({ storageState: signedOut });

  test("«Главная без входа»: the sign-in page, no contacts", async ({
    page,
  }) => {
    await page.goto("/");

    await expectLoginPage(page);
    await expect(page.getByRole("heading", { name: "Контакты" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Анна Смирнова")).toHaveCount(0);
  });

  test("«Карточка по прямой ссылке без входа»: the sign-in page, no data", async ({
    page,
  }) => {
    const [contact] = await withDatabase(
      (sql) => sql`select id, name from contacts order by id limit 1`,
    );

    await page.goto(`/contacts/${contact.id}`);

    await expectLoginPage(page);
    await expect(page.getByText(contact.name)).toHaveCount(0);
  });

  test("«Проверка выкатки без входа»: /health answers", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('"status":"ok"');
  });

  test("«Ссылка отправлена» and «Содержание письма»", async ({ page }) => {
    const email = uniqueEmail("anna");
    const mailbox = await openMailbox(email);

    await requestLink(page, email);

    await expect(sentMessage(page, email)).toBeVisible();
    const message = await mailbox.message();
    expect(message.From).toMatchObject({
      Name: "Личная CRM",
      Address: "noreply@mail.crm.vupsen.space",
    });
    expect(message.Subject).toBe("Вход в Личную CRM");
    expect(message.HTML).toContain("Войти");
    expect(message.HTML).toContain("Ссылка работает 15 минут");
    expect(message.HTML).toContain(
      "Если вы не запрашивали вход - просто проигнорируйте письмо",
    );
    expect(message.Text).toContain("Ссылка работает 15 минут");
    expect(message.Text).toContain(
      "Если вы не запрашивали вход - просто проигнорируйте письмо",
    );
  });

  test("«Письмо на компьютере разработчика»: an address that does not exist gets an email and can sign in", async ({
    page,
  }) => {
    const email = uniqueEmail("nobody");

    await signIn(page, email);

    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  });

  test("«Почта в сообщении»: spaces and capitals are removed", async ({
    page,
  }) => {
    const email = uniqueEmail("anna");
    const mailbox = await openMailbox(email);

    await requestLink(page, `  ${email.toUpperCase()} `);

    await expect(sentMessage(page, email)).toBeVisible();
    await mailbox.message();
  });

  test("«Вход по ссылке», «Первый вход», «Почта в шапке»: an empty list for a new user", async ({
    page,
  }) => {
    const email = uniqueEmail("vera");

    await signIn(page, email);

    await expect(page).toHaveURL("/");
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
    await expect(page.getByText("Добавь первый контакт")).toBeVisible();
    await expect(page.getByText("Анна Смирнова")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Пора связаться" }),
    ).toHaveCount(0);
  });

  test("«Выход»: the sign-in page, and the main page asks to sign in again", async ({
    page,
  }) => {
    await signIn(page, uniqueEmail("anna"));

    await page.getByRole("button", { name: "Выйти" }).click();

    await expectLoginPage(page);
    await page.goto("/");
    await expectLoginPage(page);
  });

  test("«Ссылка открыта второй раз»: «Ссылка устарела», and the button leads to the form", async ({
    page,
    browser,
    baseURL,
  }) => {
    const email = uniqueEmail("anna");
    const mailbox = await openMailbox(email);
    await requestLink(page, email);
    await expect(sentMessage(page, email)).toBeVisible();
    const link = await mailbox.link();
    await page.goto(link);
    await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();

    const other = await newBrowserContext(browser, baseURL);
    const otherPage = await other.newPage();
    await otherPage.goto(link);

    await expect(otherPage).toHaveURL(/\/login\/expired/);
    await expect(
      otherPage.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
    // «Переход к новой ссылке»
    await otherPage
      .getByRole("link", { name: "Запросить новую ссылку" })
      .click();
    await expectLoginPage(otherPage);
    await other.close();
  });

  test("«Ссылка старше 15 минут»: «Ссылка устарела»", async ({ page }) => {
    const email = uniqueEmail("anna");
    const mailbox = await openMailbox(email);
    await requestLink(page, email);
    await expect(sentMessage(page, email)).toBeVisible();
    const link = await mailbox.link();
    // Time cannot be sped up in a real browser: the term is moved in the database
    await withDatabase(
      (sql) =>
        sql`update verifications set expires_at = now() - interval '1 minute'`,
    );

    await page.goto(link);

    await expect(
      page.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
    await page.goto("/");
    await expectLoginPage(page);
  });

  test("«Старая ссылка после запроса новой»", async ({ page }) => {
    const email = uniqueEmail("anna");
    const mailbox = await openMailbox(email);
    await requestLink(page, email);
    await expect(sentMessage(page, email)).toBeVisible();
    const first = await mailbox.link();
    await requestLink(page, email);
    await expect(sentMessage(page, email)).toBeVisible();
    const second = await mailbox.link(2);

    await page.goto(first);
    await expect(
      page.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
    await page.goto(second);
    await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
  });

  test("«Неверный адрес в форме»: an error under the field, no email", async ({
    page,
  }) => {
    const before = await withDatabase(
      (sql) => sql`select 1 from sign_in_emails`,
    );
    await requestLink(page, "anna@");

    await expect(page.getByText("Проверь адрес почты")).toBeVisible();
    await expect(page.getByText(/Ссылка для входа отправлена/)).toHaveCount(0);
    const after = await withDatabase(
      (sql) => sql`select 1 from sign_in_emails`,
    );
    expect(after.length).toBe(before.length);
  });

  test("«Пустое поле»: nothing and spaces only", async ({ page }) => {
    await requestLink(page, "");
    await expect(page.getByText("Проверь адрес почты")).toBeVisible();

    await requestLink(page, "   ");
    await expect(page.getByText("Проверь адрес почты")).toBeVisible();
    await expect(page.getByText(/Ссылка для входа отправлена/)).toHaveCount(0);
  });

  test("«Четвёртое письмо за 10 минут»: refused, only three emails", async ({
    page,
  }) => {
    const email = uniqueEmail("anna");
    const mailbox = await openMailbox(email);
    await requestLink(page, email);
    await expect(sentMessage(page, email)).toBeVisible();
    for (let i = 0; i < 2; i++) {
      await loginForm(page).button.click();
      await expect(sentMessage(page, email)).toBeVisible();
    }
    await expect.poll(() => mailbox.received()).toBe(3);

    await loginForm(page).button.click();

    await expect(
      page.getByText("Слишком часто, попробуй через несколько минут"),
    ).toBeVisible();
    expect(await mailbox.received()).toBe(3);
  });

  test("«Переход к новой ссылке»: the page «Ссылка устарела» leads to the form", async ({
    page,
  }) => {
    await page.goto("/login/expired");

    await expect(
      page.getByText("Ссылка устарела, запроси новую"),
    ).toBeVisible();
    await page.getByRole("link", { name: "Запросить новую ссылку" }).click();

    await expectLoginPage(page);
  });
});

test.describe("signed in as the test user", () => {
  test("«Страница входа после входа»: the main page with the contacts", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
    await expect(page.getByText(e2eUser.email)).toBeVisible();
  });

  test("«Несуществующий контакт»: the same page as for someone else's contact", async ({
    page,
  }) => {
    await page.goto("/contacts/999999");

    await expect(
      page.getByRole("heading", { name: "Контакт не найден" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Все контакты" }).click();
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
  });

  test("«Изменение данных без входа»: «Сохранить» leads to sign-in, data unchanged", async ({
    page,
    context,
  }) => {
    const [contact] = await withDatabase(
      (sql) => sql`select id, name from contacts where name = 'Анна Смирнова'`,
    );
    await page.goto(`/contacts/${contact.id}`);
    await page.getByLabel("Имя").fill("Анна Взломана");
    // The session ends while the card is open (cookies erased)
    await context.clearCookies();

    await page.getByRole("button", { name: "Сохранить" }).click();

    await expectLoginPage(page);
    const [after] = await withDatabase(
      (sql) => sql`select name from contacts where id = ${contact.id}`,
    );
    expect(after.name).toBe(contact.name);
  });
});
