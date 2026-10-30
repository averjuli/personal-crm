// Main scenario and its success criteria from specs/01-продуктовая-идея.md
import { expect, test } from "@playwright/test";

import { existingContacts } from "./global-setup";

const newContact = { name: "Вера Лебедева", about: "Подруга по курсам рисования" };
const noteText = "Созвонились: договорились сходить на выставку в субботу";

test("list, add a contact, find it by name, add a note; another browser sees the same", async ({
  page,
  browser,
  baseURL,
}) => {
  const table = page.getByRole("table");
  const notes = page.getByRole("region", { name: "Заметки" });

  await test.step("Opened the app: the list shows every contact", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Контакты" })).toBeVisible();
    await expect(page.getByText(`Всего контактов: ${existingContacts.length}`)).toBeVisible();
    for (const contact of existingContacts) {
      await expect(table.getByRole("link", { name: contact.name })).toBeVisible();
    }
  });

  await test.step("Added a contact: it appears in the list", async () => {
    await page.getByRole("link", { name: "Добавить контакт" }).click();
    await page.getByLabel("Имя").fill(newContact.name);
    await page.getByLabel("Кто это").fill(newContact.about);
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await expect(page.getByText("Контакт добавлен")).toBeVisible();

    await page.goto("/");
    await expect(page.getByText(`Всего контактов: ${existingContacts.length + 1}`)).toBeVisible();
    await expect(table.getByRole("link", { name: newContact.name })).toBeVisible();
  });

  await test.step("Found the contact by name and opened the card", async () => {
    await page.getByRole("searchbox", { name: "Поиск по имени или группе" }).fill("Лебедева");
    await page.getByRole("searchbox", { name: "Поиск по имени или группе" }).press("Enter");
    await expect(page.getByText("Найдено по запросу «Лебедева»: 1")).toBeVisible();
    await expect(table.getByRole("link")).toHaveText([newContact.name]);

    await table.getByRole("link", { name: newContact.name }).click();
    await expect(page.getByRole("heading", { level: 1, name: newContact.name })).toBeVisible();
  });

  await test.step("Added a note after a talk: it is saved in the card", async () => {
    await notes.getByLabel("Текст заметки").fill(noteText);
    await notes.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(notes.getByRole("listitem").filter({ hasText: noteText })).toBeVisible();

    // After a reload the card is built from the database again
    await page.reload();
    await expect(notes.getByRole("listitem").filter({ hasText: noteText })).toBeVisible();
  });

  await test.step("Opened the same address in another browser: the same contacts", async () => {
    // A separate context shares no cookies, storage or cache with the first one
    const otherContext = await browser.newContext({ baseURL });
    const otherPage = await otherContext.newPage();
    const otherTable = otherPage.getByRole("table");

    await otherPage.goto("/");
    await expect(otherPage.getByText(`Всего контактов: ${existingContacts.length + 1}`)).toBeVisible();
    for (const contact of [...existingContacts, newContact]) {
      await expect(otherTable.getByRole("link", { name: contact.name })).toBeVisible();
    }

    await otherTable.getByRole("link", { name: newContact.name }).click();
    await expect(
      otherPage
        .getByRole("region", { name: "Заметки" })
        .getByRole("listitem")
        .filter({ hasText: noteText }),
    ).toBeVisible();

    await otherContext.close();
  });
});
