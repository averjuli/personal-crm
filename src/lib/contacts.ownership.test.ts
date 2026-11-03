// Scenarios of openspec/changes/login/specs/data-ownership/spec.md at the level
// of the data layer: user A has data, user B asks for it. Real database
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { contacts, groups, notes } from "@/db/schema";
import {
  addNote,
  createContact,
  createGroup,
  deleteContact,
  deleteGroup,
  deleteNote,
  getContact,
  listContacts,
  listGroups,
  listNotes,
  listOverdueContacts,
  markKeepInTouch,
  renameGroup,
  undoKeepInTouch,
  updateContact,
  updateNote,
} from "@/lib/contacts";
import { findSelectedGroup } from "@/lib/group-filter";

import { truncateAllTables } from "../../testing/database";
import { createTestUser } from "../../testing/users";

let a: string;
let b: string;

function input(name: string, groupIds: number[] = []) {
  return {
    name,
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
    frequency: null,
    note: null,
    groupIds,
  };
}

// What the owner sees of a contact: a foreign request must not change it
async function cardOf(owner: string, id: number) {
  return {
    contact: await getContact(owner, id),
    notes: await listNotes(owner, id),
    list: (await listContacts(owner, "", null)).map((row) => row.name),
  };
}

function names(list: { name: string }[]) {
  return list.map((row) => row.name);
}

beforeEach(async () => {
  await db.execute(sql.raw(truncateAllTables));
  a = await createTestUser("anna@example.com");
  b = await createTestUser("boris@example.com");
});

afterAll(async () => {
  await db.$client.end();
});

describe("owner of new records", () => {
  it("«Новый контакт»: contact, note and group belong to A", async () => {
    const tennis = await createGroup(a, "Теннис");
    const id = await createContact(a, {
      ...input("Вера Лебедева", [tennis.id]),
      note: "Познакомились на корте",
    });

    const [contact] = await db.select().from(contacts);
    expect(contact.id).toBe(id);
    expect(contact.ownerId).toBe(a);
    const [group] = await db.select().from(groups);
    expect(group.ownerId).toBe(a);
    // A note belongs to the owner of its contact
    const rows = await db
      .select({ body: notes.body, ownerId: contacts.ownerId })
      .from(notes)
      .innerJoin(contacts, eq(contacts.id, notes.contactId));
    expect(rows).toEqual([{ body: "Познакомились на корте", ownerId: a }]);
    expect((await getContact(a, id))!.groupIds).toEqual([tennis.id]);
  });
});

describe("B sees nothing of A", () => {
  it("«Чужой контакт в списке»", async () => {
    await createContact(a, input("Вера Лебедева"));
    await createContact(b, input("Глеб Орлов"));

    expect(names(await listContacts(b, "", null))).toEqual(["Глеб Орлов"]);
    expect(names(await listContacts(a, "", null))).toEqual(["Вера Лебедева"]);
  });

  it("«Чужой контакт в поиске»", async () => {
    await createContact(a, input("Вера Лебедева"));

    expect(await listContacts(b, "Лебедева", null)).toEqual([]);
  });

  it("the search by group name does not see groups of A", async () => {
    const tennis = await createGroup(a, "Теннис");
    await createContact(a, input("Вера", [tennis.id]));
    await createContact(b, input("Глеб"));

    expect(await listContacts(b, "теннис", null)).toEqual([]);
  });

  it("«Чужой контакт в «Пора связаться»»", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-01-01T12:00:00+03:00"));
      await createContact(a, { ...input("Вера Лебедева"), frequency: "week" });
      await createContact(b, { ...input("Глеб Орлов"), frequency: "week" });
      vi.setSystemTime(new Date("2026-10-24T12:00:00+03:00"));

      expect(names(await listOverdueContacts(b))).toEqual(["Глеб Орлов"]);
      expect(names(await listOverdueContacts(a))).toEqual(["Вера Лебедева"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("«Чужие группы»: B has none, in the list and in the card", async () => {
    const tennis = await createGroup(a, "Теннис");
    const id = await createContact(a, input("Вера", [tennis.id]));
    const own = await createContact(b, input("Глеб"));

    expect(await listGroups(b)).toEqual([]);
    expect((await getContact(b, own))!.groupIds).toEqual([]);
    expect((await listContacts(b, "", null))[0].groupNames).toEqual([]);
    expect((await getContact(a, id))!.groupIds).toEqual([tennis.id]);
  });

  it("«Чужая группа в адресе фильтра»: «Все группы» and only own contacts", async () => {
    const tennis = await createGroup(a, "Теннис");
    await createContact(a, input("Вера", [tennis.id]));
    await createContact(b, input("Глеб"));

    const selected = findSelectedGroup(await listGroups(b), String(tennis.id));

    expect(selected).toBeUndefined();
    expect(names(await listContacts(b, "", selected?.id ?? null))).toEqual([
      "Глеб",
    ]);
  });
});

describe("B cannot read or change records of A", () => {
  it("«Чужой контакт по прямой ссылке»: looks like a missing contact", async () => {
    const id = await createContact(a, input("Вера Лебедева"));

    expect(await getContact(b, id)).toBeUndefined();
    expect(await getContact(b, id + 1000)).toBeUndefined();
    expect(await listNotes(b, id)).toEqual([]);
  });

  it("«Изменение чужого контакта прямым запросом»", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-24T12:00:00+03:00"));
      const id = await createContact(a, {
        ...input("Вера Лебедева"),
        frequency: "week",
        note: "Кофе",
      });
      const before = await cardOf(a, id);

      expect(await updateContact(b, id, input("Взломана"))).toBe(false);
      expect(await markKeepInTouch(b, id, "contacted")).toBeNull();
      expect(await markKeepInTouch(b, id, "skipped")).toBeNull();
      // The same answer as for a contact that does not exist
      expect(await markKeepInTouch(b, id + 1000, "contacted")).toBeNull();
      expect(await deleteContact(b, id)).toBe(false);

      // «Отмена»: A marks, B tries to take the mark back
      const mark = (await markKeepInTouch(a, id, "contacted"))!;
      expect(await undoKeepInTouch(b, id, "contacted", mark)).toBe(false);

      const after = await cardOf(a, id);
      expect(after.contact!.name).toBe("Вера Лебедева");
      expect(after.contact!.lastContactOn).toBe("2026-10-24");
      expect(after.notes).toEqual(before.notes);
      expect(after.list).toEqual(["Вера Лебедева"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("«Заметки чужого контакта прямым запросом»", async () => {
    const id = await createContact(a, { ...input("Вера"), note: "Кофе" });
    const [note] = await listNotes(a, id);

    expect(await addNote(b, id, { body: "Чужая", notedOn: "2026-10-24" })).toBe(
      false,
    );
    expect(
      await updateNote(b, note.id, { body: "Взломана", notedOn: "2026-10-24" }),
    ).toBe(false);
    expect(await deleteNote(b, note.id)).toBe(false);

    expect(await listNotes(a, id)).toEqual([note]);
  });

  it("«Изменение чужой группы прямым запросом»", async () => {
    const tennis = await createGroup(a, "Теннис");
    const id = await createContact(a, input("Вера", [tennis.id]));

    expect(await renameGroup(b, tennis.id, "Взломана")).toBe("not-found");
    expect(await deleteGroup(b, tennis.id)).toBe(false);
    // The same answers as for a group that does not exist
    expect(await renameGroup(b, tennis.id + 1000, "Любая")).toBe("not-found");
    expect(await deleteGroup(b, tennis.id + 1000)).toBe(false);

    expect(await listGroups(a)).toEqual([
      { id: tennis.id, name: "Теннис", contactCount: 1 },
    ]);
    expect((await getContact(a, id))!.groupIds).toEqual([tennis.id]);
  });

  it("«Чужая группа у своего контакта»: saved without it", async () => {
    const tennis = await createGroup(a, "Теннис");
    const mine = await createContact(b, input("Глеб"));

    // Saving an existing contact
    expect(await updateContact(b, mine, input("Глеб", [tennis.id]))).toBe(true);
    expect((await getContact(b, mine))!.groupIds).toEqual([]);

    // Creating a new contact
    const created = await createContact(b, input("Дарья", [tennis.id]));
    expect((await getContact(b, created))!.groupIds).toEqual([]);

    expect(await listGroups(a)).toEqual([
      { id: tennis.id, name: "Теннис", contactCount: 0 },
    ]);
  });

  it("an own group is kept next to a foreign one in the same request", async () => {
    const theirs = await createGroup(a, "Теннис");
    const mine = await createGroup(b, "Друзья");

    const id = await createContact(b, input("Глеб", [theirs.id, mine.id]));

    expect((await getContact(b, id))!.groupIds).toEqual([mine.id]);
  });
});
