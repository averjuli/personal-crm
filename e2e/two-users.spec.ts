// Success criterion of openspec/changes/login: two users in two separate
// browsers each add a contact and never see the contact of the other, neither
// in the list, nor in the search, nor by a direct link
import { type Browser, type Page } from "@playwright/test";
import { expect, newBrowserContext, test } from "./fixtures";

import { uniqueEmail } from "./mailpit";
import { signIn } from "./sign-in";
import { signedOut } from "./test-user";

// Nobody is signed in at the start: each user signs in by the link
test.use({ storageState: signedOut });

const searchbox = (page: Page) =>
  page.getByRole("searchbox", { name: "Поиск по имени или группе" });

// A separate context shares no cookies, storage or cache with the others
async function openBrowserOf(
  browser: Browser,
  baseURL: string | undefined,
  email: string,
) {
  const context = await newBrowserContext(browser, baseURL);
  const page = await context.newPage();
  await signIn(page, email);
  return { context, page };
}

// Adds a contact in the form and returns the address of its card
async function addContact(page: Page, name: string) {
  await page.getByRole("link", { name: "Добавить контакт" }).click();
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Добавить контакт" }).click();
  await expect(page.getByText("Контакт добавлен")).toBeVisible();
  return page.url();
}

async function search(page: Page, text: string) {
  await searchbox(page).fill(text);
  await searchbox(page).press("Enter");
}

// What this user sees of the contact of the other one
async function expectNoTraceOf(
  page: Page,
  other: { name: string; url: string },
) {
  const surname = other.name.split(" ")[1];

  await test.step("«Чужой контакт в списке»: not in the list, not counted", async () => {
    await page.goto("/");
    await expect(page.getByText("Всего контактов: 1")).toBeVisible();
    await expect(page.getByRole("link", { name: other.name })).toHaveCount(0);
  });

  await test.step("«Чужой контакт в поиске»: nobody found", async () => {
    await search(page, surname);
    await expect(
      page.getByText(`Найдено по запросу «${surname}»: 0`),
    ).toBeVisible();
    await expect(page.getByText("Никого не нашли")).toBeVisible();
  });

  await test.step("«Чужой контакт по прямой ссылке»: «Контакт не найден»", async () => {
    await page.goto(other.url);
    await expect(
      page.getByRole("heading", { name: "Контакт не найден" }),
    ).toBeVisible();
    await expect(page.getByText(other.name)).toHaveCount(0);
  });
}

test("two users do not see each other's contacts", async ({
  browser,
  baseURL,
}) => {
  const anna = { name: "Вера Лебедева", url: "" };
  const boris = { name: "Глеб Орлов", url: "" };
  const [a, b] = await Promise.all([
    openBrowserOf(browser, baseURL, uniqueEmail("anna")),
    openBrowserOf(browser, baseURL, uniqueEmail("boris")),
  ]);

  await test.step("A adds a contact, B adds his own", async () => {
    anna.url = await addContact(a.page, anna.name);
    boris.url = await addContact(b.page, boris.name);
    expect(anna.url).not.toBe(boris.url);
  });

  await test.step("B sees nothing of A", async () => {
    await expectNoTraceOf(b.page, anna);
  });

  await test.step("A sees nothing of B", async () => {
    await expectNoTraceOf(a.page, boris);
  });

  await test.step("Each still has the own contact", async () => {
    await a.page.goto(anna.url);
    await expect(
      a.page.getByRole("heading", { level: 1, name: anna.name }),
    ).toBeVisible();
    await b.page.goto(boris.url);
    await expect(
      b.page.getByRole("heading", { level: 1, name: boris.name }),
    ).toBeVisible();
  });

  await a.context.close();
  await b.context.close();
});
