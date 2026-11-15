import type { Page } from "@playwright/test";
import postgres from "postgres";
import { expect, test } from "./fixtures";
import { resetDatabase } from "./global-setup";
import { e2eDatabaseUrl } from "./database";
import { e2eUser } from "./test-user";
import { todayInAppTimeZone } from "@/lib/keep-in-touch";

test.afterEach(async () => {
  await resetDatabase();
});

async function fillBirthday(page: Page, day: string, month: string, year = "") {
  await page.getByLabel("День рождения", { exact: true }).fill(day);
  await page.getByLabel("Месяц рождения", { exact: true }).fill(month);
  await page
    .getByLabel("Год рождения (необязательно)", { exact: true })
    .fill(year);
}

async function expectBirthday(
  page: Page,
  day: string,
  month: string,
  year = "",
) {
  await expect(page.getByLabel("День рождения", { exact: true })).toHaveValue(
    day,
  );
  await expect(page.getByLabel("Месяц рождения", { exact: true })).toHaveValue(
    month,
  );
  await expect(
    page.getByLabel("Год рождения (необязательно)", { exact: true }),
  ).toHaveValue(year);
}

async function create(page: Page, day: string, month: string, year = "") {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill("Ирина Белова");
  await fillBirthday(page, day, month, year);
  await page
    .getByRole("button", { name: "Добавить контакт", exact: true })
    .click();
  await expect(page.getByText("Контакт добавлен")).toBeVisible();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Изменения сохранены")).toBeVisible();
  await page.reload();
}

test("creates a contact without a birthday", async ({ page }) => {
  await create(page, "", "");
  await page.reload();
  await expectBirthday(page, "", "");
});

test("creates a birthday without a year", async ({ page }) => {
  await create(page, "15", "11");
  await page.reload();
  await expectBirthday(page, "15", "11");
});

test("creates a complete birth date", async ({ page }) => {
  await create(page, "29", "2", "2000");
  await page.reload();
  await expectBirthday(page, "29", "2", "2000");
});

test("changes the day and month", async ({ page }) => {
  await create(page, "20", "11");
  await fillBirthday(page, "10", "12");
  await save(page);
  await expectBirthday(page, "10", "12");
});

test("adds a birth year", async ({ page }) => {
  await create(page, "15", "11");
  await fillBirthday(page, "15", "11", "1990");
  await save(page);
  await expectBirthday(page, "15", "11", "1990");
});

test("removes only the birth year", async ({ page }) => {
  await create(page, "15", "11", "1990");
  await fillBirthday(page, "15", "11");
  await save(page);
  await expectBirthday(page, "15", "11");
});

test("clears the complete birthday", async ({ page }) => {
  await create(page, "15", "11", "1990");
  await fillBirthday(page, "", "");
  await save(page);
  await expectBirthday(page, "", "");
});

async function withDatabase<T>(action: (client: postgres.Sql) => Promise<T>) {
  const client = postgres(e2eDatabaseUrl, { max: 1 });
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

async function addUpcoming(name = "Именинница", overdue = false) {
  const today = todayInAppTimeZone();
  const day = new Date(`${today}T00:00:00Z`);
  return withDatabase(async (client) => {
    const [created] = await client<{ id: number }[]>`
      insert into contacts (owner_id, name, birth_day, birth_month, birth_year, contact_frequency, frequency_set_on)
      values (${e2eUser.id}, ${name}, ${day.getUTCDate()}, ${day.getUTCMonth() + 1}, 2000,
        ${overdue ? "week" : null}, ${overdue ? today : null}::date - ${overdue ? 8 : 0}::integer) returning id`;
    return created.id;
  });
}

const birthdaysBlock = (page: Page) =>
  page.getByRole("region", { name: "Скоро день рождения", exact: true });

test("hides birthdays when the user has no contacts", async ({ page }) => {
  await withDatabase(async (client) => {
    await client`delete from contacts where owner_id = ${e2eUser.id}`;
  });
  await page.goto("/");
  await expect(birthdaysBlock(page)).toHaveCount(0);
  await expect(
    page.getByText("Добавь первый контакт", { exact: false }),
  ).toBeVisible();
});

test("hides birthdays when none are upcoming", async ({ page }) => {
  await page.goto("/");
  await expect(birthdaysBlock(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Скоро день рождения" }),
  ).toHaveCount(0);
});

test("hides the birthday block during search", async ({ page }) => {
  await addUpcoming();
  await page.goto("/");
  await expect(birthdaysBlock(page)).toBeVisible();
  await page.getByRole("searchbox").fill("Именинница");
  await page.getByRole("searchbox").press("Enter");
  await expect(birthdaysBlock(page)).toHaveCount(0);
  await expect(
    page.getByRole("table").getByRole("link", { name: "Именинница" }),
  ).toBeVisible();
});

test("restores birthdays after clearing search", async ({ page }) => {
  await addUpcoming();
  await page.goto("/?q=Именинница");
  await expect(birthdaysBlock(page)).toHaveCount(0);
  await page.getByRole("link", { name: "Сбросить", exact: true }).click();
  await expect(birthdaysBlock(page)).toBeVisible();
});

test("keeps birthdays outside the selected group", async ({ page }) => {
  await addUpcoming();
  await withDatabase(async (client) => {
    await client`insert into "groups" (owner_id, name) values (${e2eUser.id}, 'Теннис')`;
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Группа", exact: true }).click();
  await page.getByRole("option", { name: "Теннис", exact: true }).click();
  await expect(
    birthdaysBlock(page).getByRole("link", { name: "Именинница" }),
  ).toBeVisible();
  await expect(
    page.getByText("В этой группе пока нет контактов", { exact: true }),
  ).toBeVisible();
});

test("shows a date without year and links to the contact", async ({ page }) => {
  const id = await addUpcoming();
  await page.goto("/");
  const block = birthdaysBlock(page);
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${todayInAppTimeZone()}T00:00:00Z`));
  await expect(block).toContainText(date);
  await expect(block).not.toContainText("2000");
  await block.getByRole("link", { name: "Именинница", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${id}`));
  await expect(
    page.getByRole("heading", { name: "Именинница", exact: true }),
  ).toBeVisible();
});

test("shows one contact in both blocks with birthdays first", async ({
  page,
}) => {
  await addUpcoming("Именинница", true);
  await page.goto("/");
  const birthday = birthdaysBlock(page);
  const overdue = page.getByRole("region", {
    name: "Пора связаться",
    exact: true,
  });
  await expect(
    birthday.getByRole("link", { name: "Именинница" }),
  ).toBeVisible();
  await expect(overdue.getByRole("link", { name: "Именинница" })).toBeVisible();
  expect((await birthday.boundingBox())!.y).toBeLessThan(
    (await overdue.boundingBox())!.y,
  );
});
