// Main user paths of openspec/specs/contact-groups/spec.md. The rules behind
// them are checked in src/lib/contacts.groups.test.ts
import { expect, test, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contactGroups, contacts, groups } from "@/db/schema";

import { e2eDatabaseUrl } from "./database";
import { resetDatabase } from "./global-setup";
import { e2eUser } from "./test-user";

async function withDatabase<T>(
  work: (db: ReturnType<typeof drizzle>) => Promise<T>,
) {
  const client = postgres(e2eDatabaseUrl, { max: 1, onnotice: () => {} });
  try {
    return await work(drizzle(client));
  } finally {
    await client.end();
  }
}

// Puts known contacts into a group, creating the group if it is missing.
// Returns the group id
async function putIntoGroup(groupName: string, contactNames: string[]) {
  return withDatabase(async (db) => {
    const [existing] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.name, groupName));
    const group =
      existing ??
      (
        await db
          .insert(groups)
          .values({ name: groupName, ownerId: e2eUser.id })
          .returning({ id: groups.id })
      )[0];
    if (contactNames.length) {
      const members = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(inArray(contacts.name, contactNames));
      await db
        .insert(contactGroups)
        .values(
          members.map(({ id }) => ({ contactId: id, groupId: group.id })),
        );
    }
    return group.id;
  });
}

// As if the group was deleted in another browser tab
async function deleteGroupElsewhere(id: number) {
  await withDatabase((db) => db.delete(groups).where(eq(groups.id, id)));
}

function contactRow(page: Page, name: string) {
  return page
    .getByRole("table")
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

// The «Группы» column is the second one
function groupsCell(page: Page, name: string) {
  return contactRow(page, name).getByRole("cell").nth(1);
}

function groupRow(page: Page, name: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

function groupBox(page: Page, name: string) {
  return page
    .getByRole("group", { name: "Группы" })
    .getByRole("checkbox", { name, exact: true });
}

async function addGroupInForm(page: Page, name: string) {
  const field = page.getByRole("group", { name: "Группы" });
  await field.getByLabel("Новая группа").fill(name);
  await field.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(groupBox(page, name)).toBeChecked();
}

async function chooseGroup(page: Page, name: string) {
  await page.getByLabel("Группа", { exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function search(page: Page, query: string) {
  const box = page.getByRole("searchbox", {
    name: "Поиск по имени или группе",
  });
  await box.fill(query);
  await box.press("Enter");
}

// Each test starts from the contacts of global-setup and no groups; other spec
// files expect the same
test.beforeEach(async () => {
  await resetDatabase();
});

test.afterEach(async () => {
  await resetDatabase();
});

test("sort contacts into groups in the new contact form and the card", async ({
  page,
}) => {
  const newName = "Ирина Белова";

  await test.step("The new contact form says there are no groups yet", async () => {
    await page.goto("/contacts/new");
    const field = page.getByRole("group", { name: "Группы" });
    await expect(field.getByText("Групп пока нет")).toBeVisible();
    await expect(field.getByLabel("Новая группа")).toBeVisible();
  });

  await test.step("Created a contact with a new group «Теннис»", async () => {
    await page.getByLabel("Имя").fill(newName);
    await addGroupInForm(page, "Теннис");
    await page.getByRole("button", { name: "Добавить контакт" }).click();
    await expect(page.getByText("Контакт добавлен")).toBeVisible();
    await expect(groupBox(page, "Теннис")).toBeChecked();

    await page.reload();
    await expect(groupBox(page, "Теннис")).toBeChecked();
  });

  await test.step("Another card offers «Теннис»; checked it and added «Друзья»", async () => {
    await page.goto("/");
    await page
      .getByRole("table")
      .getByRole("link", { name: "Анна Смирнова" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Анна Смирнова" }),
    ).toBeVisible();
    await expect(groupBox(page, "Теннис")).not.toBeChecked();

    await addGroupInForm(page, "Друзья");
    await groupBox(page, "Теннис").check();
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Изменения сохранены")).toBeVisible();

    await page.reload();
    await expect(groupBox(page, "Друзья")).toBeChecked();
    await expect(groupBox(page, "Теннис")).toBeChecked();
  });

  await test.step("The list shows the groups of each contact", async () => {
    await page.goto("/");
    await expect(groupsCell(page, "Анна Смирнова")).toHaveText(
      "Друзья, Теннис",
    );
    await expect(groupsCell(page, newName)).toHaveText("Теннис");
    await expect(groupsCell(page, "Борис Кузнецов")).toHaveText("");
  });
});

test("find the people of one circle with the group filter and the search", async ({
  page,
}) => {
  const table = page.getByRole("table");
  await putIntoGroup("Теннис", ["Анна Смирнова", "Борис Кузнецов"]);
  const emptyGroupId = await putIntoGroup("Аналитики", []);

  await test.step("The empty search field shows its hint", async () => {
    await page.goto("/");
    await expect(
      page.getByPlaceholder("Поиск по имени или группе"),
    ).toHaveValue("");
    await expect(page.getByText("Всего контактов: 3")).toBeVisible();
  });

  await test.step("Chose «Теннис»: only its contacts are listed", async () => {
    await chooseGroup(page, "Теннис");
    await expect(page.getByText("В группе «Теннис»: 2")).toBeVisible();
    await expect(table.getByRole("link")).toHaveText([
      "Анна Смирнова",
      "Борис Кузнецов",
    ]);
  });

  await test.step("After a reload the filter is still on", async () => {
    await page.reload();
    await expect(page.getByLabel("Группа", { exact: true })).toContainText(
      "Теннис",
    );
    await expect(table.getByRole("link")).toHaveText([
      "Анна Смирнова",
      "Борис Кузнецов",
    ]);
  });

  await test.step("«Все группы» lists everyone again", async () => {
    await chooseGroup(page, "Все группы");
    await expect(page.getByText("Всего контактов: 3")).toBeVisible();
    await expect(table.getByRole("link")).toHaveText([
      "Анна Смирнова",
      "Борис Кузнецов",
      "Галина Орлова",
    ]);
  });

  await test.step("The search finds contacts by the group name", async () => {
    await search(page, "теннис");
    await expect(
      page.getByText("Найдено по запросу «теннис»: 2"),
    ).toBeVisible();
    await expect(table.getByRole("link")).toHaveText([
      "Анна Смирнова",
      "Борис Кузнецов",
    ]);
    await page.getByRole("link", { name: "Сбросить" }).click();
    await expect(page.getByText("Всего контактов: 3")).toBeVisible();
  });

  await test.step("A group without contacts says so", async () => {
    await chooseGroup(page, "Аналитики");
    await expect(
      page.getByText("В этой группе пока нет контактов"),
    ).toBeVisible();
  });

  await test.step("The group was deleted elsewhere: the page lists everyone", async () => {
    await deleteGroupElsewhere(emptyGroupId);
    await page.reload();
    await expect(page.getByLabel("Группа", { exact: true })).toContainText(
      "Все группы",
    );
    await expect(page.getByText("Всего контактов: 3")).toBeVisible();
  });
});

test("manage groups on the «Группы» page", async ({ page }) => {
  await test.step("No groups yet: the page says so", async () => {
    await page.goto("/");
    await page.getByRole("link", { name: "Группы", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Группы" }),
    ).toBeVisible();
    await expect(page.getByText("Групп пока нет")).toBeVisible();
    await expect(page.getByLabel("Новая группа")).toBeVisible();
  });

  await test.step("Created «Теннис» and «Друзья» on the page", async () => {
    for (const name of ["Теннис", "Друзья"]) {
      await page.getByLabel("Новая группа").fill(name);
      await page.getByRole("button", { name: "Добавить", exact: true }).click();
      await expect(groupRow(page, name)).toContainText("0 контактов");
    }
  });

  await test.step("The list is alphabetical with the number of contacts", async () => {
    await putIntoGroup("Друзья", ["Анна Смирнова", "Борис Кузнецов"]);
    await putIntoGroup("Теннис", ["Анна Смирнова"]);
    await page.reload();
    await expect(page.getByRole("listitem").getByRole("link")).toHaveText([
      "Друзья",
      "Теннис",
    ]);
    await expect(groupRow(page, "Друзья")).toContainText("2 контакта");
    await expect(groupRow(page, "Теннис")).toContainText("1 контакт");
  });

  await test.step("The group name opens its contacts", async () => {
    await page.getByRole("link", { name: "Теннис", exact: true }).click();
    await expect(page.getByText("В группе «Теннис»: 1")).toBeVisible();
    await expect(page.getByRole("table").getByRole("link")).toHaveText([
      "Анна Смирнова",
    ]);
    await page.goBack();
  });

  await test.step("A name of another group is refused", async () => {
    await groupRow(page, "Теннис")
      .getByRole("button", { name: "Переименовать" })
      .click();
    await page.getByLabel("Новое название группы «Теннис»").fill("друзья");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(
      page.getByText("Группа с таким названием уже есть"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Отмена" }).click();
    await expect(groupRow(page, "Теннис")).toContainText("1 контакт");
  });

  await test.step("Renamed «Теннис»: the contacts show the new name", async () => {
    await groupRow(page, "Теннис")
      .getByRole("button", { name: "Переименовать" })
      .click();
    await page
      .getByLabel("Новое название группы «Теннис»")
      .fill("Теннис по средам");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(groupRow(page, "Теннис по средам")).toContainText("1 контакт");

    await page.goto("/");
    await expect(groupsCell(page, "Анна Смирнова")).toHaveText(
      "Друзья, Теннис по средам",
    );
    await page.goto("/groups");
  });

  await test.step("Cancelled the deletion: nothing changed", async () => {
    await groupRow(page, "Друзья")
      .getByRole("button", { name: "Удалить" })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("«Друзья» (2 контакта)");
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(dialog).toBeHidden();
    await expect(groupRow(page, "Друзья")).toContainText("2 контакта");
  });

  await test.step("Deleted «Друзья»: the contacts stay without it", async () => {
    await groupRow(page, "Друзья")
      .getByRole("button", { name: "Удалить" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Удалить" })
      .click();
    await expect(
      page.getByRole("link", { name: "Друзья", exact: true }),
    ).toBeHidden();
    await expect(page.getByRole("listitem").getByRole("link")).toHaveText([
      "Теннис по средам",
    ]);

    await page.goto("/");
    await expect(page.getByText("Всего контактов: 3")).toBeVisible();
    await expect(groupsCell(page, "Анна Смирнова")).toHaveText(
      "Теннис по средам",
    );
    await expect(groupsCell(page, "Борис Кузнецов")).toHaveText("");
  });
});
