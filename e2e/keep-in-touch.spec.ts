// Main user paths of openspec/specs/keep-in-touch/spec.md. The server runs on
// the real clock, so the days here are counted back from the real today
import { expect, test, type Page } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contacts, notes } from "@/db/schema";
import { formatDay, todayInAppTimeZone } from "@/lib/keep-in-touch";

import { e2eDatabaseUrl } from "./database";
import { resetDatabase } from "./global-setup";

const noteText = "Созвонились, обсудили отпуск";

function daysAgo(days: number) {
  const date = new Date(`${todayInAppTimeZone()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// A weekly contact whose last note was 12 days ago: 5 days overdue
async function addOverdueContact(name: string) {
  const client = postgres(e2eDatabaseUrl, { max: 1 });
  try {
    const db = drizzle(client);
    const [contact] = await db
      .insert(contacts)
      .values({ name, contactFrequency: "week", frequencySetOn: daysAgo(30) })
      .returning({ id: contacts.id });
    await db
      .insert(notes)
      .values({ contactId: contact.id, body: noteText, notedOn: daysAgo(12) });
  } finally {
    await client.end();
  }
}

function overdueBlock(page: Page) {
  return page.getByRole("region", { name: "Пора связаться" });
}

function overdueRow(page: Page, name: string) {
  return overdueBlock(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

// Other spec files expect only the contacts from global-setup
test.afterEach(async () => {
  await resetDatabase();
});

test("a frequency and a back-dated note put the contact into «Пора связаться»", async ({
  page,
}) => {
  const name = "Ирина Белова";
  const notedOn = daysAgo(10);

  await test.step("Created a weekly contact", async () => {
    await page.goto("/contacts/new");
    await page.getByLabel("Имя").fill(name);
    await page.getByLabel("Как часто общаться").click();
    await page.getByRole("option", { name: "Раз в неделю" }).click();
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await expect(page.getByText("Контакт добавлен")).toBeVisible();
    await expect(page.getByLabel("Как часто общаться")).toContainText(
      "Раз в неделю",
    );
  });

  await test.step("Added a note dated 10 days ago", async () => {
    const notesRegion = page.getByRole("region", { name: "Заметки" });
    await notesRegion.getByLabel("Текст заметки").fill(noteText);
    await notesRegion.getByLabel("Дата").fill(notedOn);
    await notesRegion.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(
      notesRegion.getByRole("listitem").filter({ hasText: noteText }),
    ).toBeVisible();
  });

  await test.step("The contact is in the block, 3 days overdue", async () => {
    await page.goto("/");
    await expect(overdueRow(page, name)).toContainText(
      "Раз в неделю · просрочено на 3 дня",
    );
  });

  await test.step("The name opens the card with the days", async () => {
    await overdueRow(page, name).getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(
      page.getByText(`Последнее общение: ${formatDay(notedOn)}`),
    ).toBeVisible();
    await expect(
      page.getByText("Пора связаться: просрочено на 3 дня"),
    ).toBeVisible();
  });
});

test("«Уже связался» removes the contact and keeps the user on the main page", async ({
  page,
}) => {
  const name = "Борис Орлов";
  await addOverdueContact(name);
  await page.goto("/");
  const row = overdueRow(page, name);
  const contacted = row.getByRole("button", { name: "Уже связался" });
  const skip = row.getByRole("button", { name: "Пропустить этот раз" });

  await test.step("The buttons have captions shown on hover", async () => {
    await contacted.hover();
    await expect(contacted).toHaveAttribute("title", "Уже связался");
    await skip.hover();
    await expect(skip).toHaveAttribute("title", "Пропустить этот раз");
  });

  await test.step("Clicked the check mark: still on the main page", async () => {
    await contacted.click();
    await expect(page.getByText(`Отметили: ${name}`)).toBeVisible();
    await expect(page).toHaveURL("/");
  });

  await test.step("5 seconds later the mark stays", async () => {
    await expect(page.getByText(`Отметили: ${name}`)).toBeHidden({
      timeout: 10_000,
    });
    await expect(overdueBlock(page)).toContainText("Со всеми на связи");

    await page.reload();
    await expect(overdueBlock(page)).toContainText("Со всеми на связи");
  });

  await test.step("The card shows today as the last communication", async () => {
    await page
      .getByRole("table")
      .getByRole("link", { name, exact: true })
      .click();
    await expect(
      page.getByText(`Последнее общение: ${formatDay(todayInAppTimeZone())}`),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Заметки" })
        .getByRole("listitem")
        .filter({ hasText: noteText }),
    ).toBeVisible();
  });
});

test("«Отменить» brings the contact back after the cross and the check mark", async ({
  page,
}) => {
  const name = "Вера Ким";
  await addOverdueContact(name);
  await page.goto("/");
  const row = overdueRow(page, name);
  const overdue = "Раз в неделю · просрочено на 5 дней";
  await expect(row).toContainText(overdue);

  await test.step("Undid «Пропустить этот раз»", async () => {
    await row.getByRole("button", { name: "Пропустить этот раз" }).click();
    const undoRow = overdueBlock(page)
      .getByRole("listitem")
      .filter({ hasText: `Пропустили: ${name}` });
    await undoRow.getByRole("button", { name: "Отменить" }).click();
    await expect(row).toContainText(overdue);
  });

  await test.step("Undid «Уже связался»", async () => {
    await row.getByRole("button", { name: "Уже связался" }).click();
    const undoRow = overdueBlock(page)
      .getByRole("listitem")
      .filter({ hasText: `Отметили: ${name}` });
    await undoRow.getByRole("button", { name: "Отменить" }).click();
    await expect(row).toContainText(overdue);
  });

  await test.step("After a reload the card has the old days", async () => {
    await page.reload();
    await expect(row).toContainText(overdue);

    await row.getByRole("link", { name }).click();
    await expect(
      page.getByText(`Последнее общение: ${formatDay(daysAgo(12))}`),
    ).toBeVisible();
    await expect(
      page.getByText("Пора связаться: просрочено на 5 дней"),
    ).toBeVisible();
  });
});
