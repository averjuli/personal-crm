// Scenarios of openspec/specs/contact-groups/spec.md, checked against a real
// database. Name rules of a group are in group-form.test.ts
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  addNote,
  createContact,
  createGroup,
  deleteGroup,
  getContact,
  listContacts,
  listGroups,
  listNotes,
  renameGroup,
  updateContact,
} from "@/lib/contacts";

import { truncateAllTables } from "../../testing/database";

type TestGroup = { id: number; name: string };

async function newContact(name: string, groups: TestGroup[] = []) {
  return createContact({
    name,
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
    frequency: null,
    note: null,
    groupIds: groups.map((group) => group.id),
  });
}

// What «Сохранить» in the card does with the checked groups
async function saveGroups(id: number, groups: TestGroup[]) {
  const contact = (await getContact(id))!;
  await updateContact(id, {
    name: contact.name,
    about: contact.about,
    howWeMet: contact.howWeMet,
    phone: contact.phone,
    email: contact.email,
    frequency: contact.frequency,
    groupIds: groups.map((group) => group.id),
  });
}

async function checkedGroupIds(id: number) {
  return (await getContact(id))!.groupIds.toSorted((a, b) => a - b);
}

function idsOf(...groups: TestGroup[]) {
  return groups.map((group) => group.id).toSorted((a, b) => a - b);
}

async function groupsPage() {
  return (await listGroups()).map((group) => [group.name, group.contactCount]);
}

async function listedNames(search: string, group: TestGroup | null = null) {
  return (await listContacts(search, group?.id ?? null)).map((row) => row.name);
}

// Contact name → text of the «Группы» cell in the list
async function groupsColumn() {
  return Object.fromEntries(
    (await listContacts("", null)).map((row) => [
      row.name,
      row.groupNames.join(", "),
    ]),
  );
}

beforeEach(async () => {
  await db.execute(sql.raw(truncateAllTables));
});

afterAll(async () => {
  await db.$client.end();
});

describe("contact group", () => {
  it("a contact keeps several checked groups", async () => {
    const friends = await createGroup("Друзья");
    const tennis = await createGroup("Теннис");
    const anna = await newContact("Анна");

    await saveGroups(anna, [friends, tennis]);

    expect(await checkedGroupIds(anna)).toEqual(idsOf(friends, tennis));
  });

  it("a contact with every group unchecked has no groups", async () => {
    const friends = await createGroup("Друзья");
    const tennis = await createGroup("Теннис");
    const anna = await newContact("Анна", [friends, tennis]);

    await saveGroups(anna, []);

    expect(await checkedGroupIds(anna)).toEqual([]);
    expect(await groupsColumn()).toEqual({ Анна: "" });
  });

  it("a group without contacts stays", async () => {
    await createGroup("Аналитики");

    expect(await groupsPage()).toEqual([["Аналитики", 0]]);
  });

  it("a group stays when its last contact leaves it", async () => {
    const analysts = await createGroup("Аналитики");
    const anna = await newContact("Анна", [analysts]);

    await saveGroups(anna, []);

    expect(await groupsPage()).toEqual([["Аналитики", 0]]);
  });
});

describe("groups in the card and the new contact form", () => {
  it("a group added in one card is offered to every other contact", async () => {
    const anna = await newContact("Анна");
    await newContact("Борис");

    const analysts = await createGroup("Аналитики");
    await saveGroups(anna, [analysts]);

    expect(await checkedGroupIds(anna)).toEqual(idsOf(analysts));
    // Every card lists all groups
    expect((await listGroups()).map((group) => group.name)).toEqual([
      "Аналитики",
    ]);
  });

  it("a new contact keeps the groups checked in the form", async () => {
    const family = await createGroup("Семья");

    const vera = await newContact("Вера", [family]);

    expect(await checkedGroupIds(vera)).toEqual(idsOf(family));
  });

  it("adding a name that exists in another case gives the existing group", async () => {
    const tennis = await createGroup("Теннис");

    const added = await createGroup("теннис");

    expect(added).toEqual(tennis);
    expect(await groupsPage()).toEqual([["Теннис", 0]]);
  });
});

describe("«Группы» page", () => {
  it("lists the groups alphabetically with the number of contacts", async () => {
    const tennis = await createGroup("Теннис");
    const friends = await createGroup("Друзья");
    await newContact("Анна", [friends, tennis]);
    await newContact("Борис", [friends]);

    expect(await groupsPage()).toEqual([
      ["Друзья", 2],
      ["Теннис", 1],
    ]);
  });

  it("a group created on the page has no contacts", async () => {
    await newContact("Анна");

    await createGroup("Семья");

    expect(await groupsPage()).toEqual([["Семья", 0]]);
  });

  it("is empty when there are no groups", async () => {
    expect(await listGroups()).toEqual([]);
  });
});

describe("renaming a group", () => {
  it("keeps the contacts and shows the new name in the list", async () => {
    const tennis = await createGroup("Теннис");
    const anna = await newContact("Анна", [tennis]);
    const boris = await newContact("Борис", [tennis]);

    expect(await renameGroup(tennis.id, "Теннис по средам")).toBe("renamed");

    expect(await checkedGroupIds(anna)).toEqual(idsOf(tennis));
    expect(await checkedGroupIds(boris)).toEqual(idsOf(tennis));
    expect(await groupsColumn()).toEqual({
      Анна: "Теннис по средам",
      Борис: "Теннис по средам",
    });
    expect(await groupsPage()).toEqual([["Теннис по средам", 2]]);
  });

  it("a case-only change is saved without a duplicate error", async () => {
    const tennis = await createGroup("теннис");

    expect(await renameGroup(tennis.id, "Теннис")).toBe("renamed");

    expect(await groupsPage()).toEqual([["Теннис", 0]]);
  });

  it("a name of another group in any case is refused", async () => {
    await createGroup("Друзья");
    const tennis = await createGroup("Теннис");

    expect(await renameGroup(tennis.id, "друзья")).toBe("taken");

    expect(await groupsPage()).toEqual([
      ["Друзья", 0],
      ["Теннис", 0],
    ]);
  });
});

describe("deleting a group", () => {
  it("removes the group from its contacts and keeps the contacts with their notes", async () => {
    const tennis = await createGroup("Теннис");
    const anna = await newContact("Анна", [tennis]);
    await newContact("Борис", [tennis]);
    await newContact("Вера", [tennis]);
    await addNote(anna, { body: "Сыграли в субботу", notedOn: "2026-10-24" });

    expect(await deleteGroup(tennis.id)).toBe(true);

    expect(await listGroups()).toEqual([]);
    expect(await groupsColumn()).toEqual({ Анна: "", Борис: "", Вера: "" });
    expect((await listNotes(anna)).map((note) => note.body)).toEqual([
      "Сыграли в субботу",
    ]);
  });

  it("keeps the other groups of the contact", async () => {
    const friends = await createGroup("Друзья");
    const tennis = await createGroup("Теннис");
    const anna = await newContact("Анна", [friends, tennis]);

    await deleteGroup(tennis.id);

    expect(await checkedGroupIds(anna)).toEqual(idsOf(friends));
    expect(await groupsPage()).toEqual([["Друзья", 1]]);
  });
});

describe("groups in the contact list", () => {
  it("shows the groups of a contact alphabetically, nothing without groups", async () => {
    const tennis = await createGroup("Теннис");
    const friends = await createGroup("Друзья");
    await newContact("Анна", [tennis, friends]);
    await newContact("Борис");

    expect(await groupsColumn()).toEqual({
      Анна: "Друзья, Теннис",
      Борис: "",
    });
  });
});

describe("filter by group", () => {
  it("shows only the contacts of the chosen group", async () => {
    const tennis = await createGroup("Теннис");
    await newContact("Анна", [tennis]);
    await newContact("Борис", [tennis]);
    await newContact("Вера");

    expect(await listedNames("", tennis)).toEqual(["Анна", "Борис"]);
  });

  it("«Все группы» shows every contact", async () => {
    const tennis = await createGroup("Теннис");
    await newContact("Анна", [tennis]);
    await newContact("Вера");

    expect(await listedNames("", null)).toEqual(["Анна", "Вера"]);
  });

  it("works together with the search by name or group", async () => {
    const tennis = await createGroup("Теннис");
    const english = await createGroup("Английский");
    // In the group, «ан» in the name
    await newContact("Анна", [tennis]);
    // In the group, «ан» in another group
    await newContact("Борис", [tennis, english]);
    // In the group, no «ан»
    await newContact("Глеб", [tennis]);
    // «ан» in the name, not in the group
    await newContact("Андрей", [english]);

    expect(await listedNames("Ан", tennis)).toEqual(["Анна", "Борис"]);
  });

  it("a group without contacts gives an empty list", async () => {
    const empty = await createGroup("Аналитики");
    await newContact("Анна");

    expect(await listedNames("", empty)).toEqual([]);
  });
});

describe("search by group name", () => {
  it("finds the contacts of a group whatever their names", async () => {
    const tennis = await createGroup("Теннис");
    await newContact("Анна", [tennis]);
    await newContact("Борис", [tennis]);
    await newContact("Вера");

    expect(await listedNames("теннис")).toEqual(["Анна", "Борис"]);
  });

  it("still finds contacts by name", async () => {
    const friends = await createGroup("Друзья");
    await newContact("Анна Смирнова", [friends]);
    await newContact("Анна Ким");
    await newContact("Борис", [friends]);

    expect(await listedNames("анна")).toEqual(["Анна Ким", "Анна Смирнова"]);
  });
});
