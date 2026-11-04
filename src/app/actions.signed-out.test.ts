// «Изменение данных без входа» of openspec/specs/user-auth: every server action
// that creates, changes or deletes a contact, a note or a group must refuse a
// request without a session and leave the database as it was. The actions are
// called the way Next.js calls them, with real ids of existing records, so a
// forgotten requireUserId() in any of them shows up as changed data. Real
// database; only the request headers are replaced
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  contactGroups,
  contacts,
  groups,
  notes,
  sessions,
  users,
} from "@/db/schema";
import { createContact, createGroup, listNotes } from "@/lib/contacts";

import { truncateAllTables } from "../../testing/database";
import { createTestUser } from "../../testing/users";

const request = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(request.cookie ? { cookie: request.cookie } : {}),
}));
const revalidated = vi.hoisted(() => ({ calls: 0 }));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    revalidated.calls += 1;
  },
}));

import {
  addNoteAction,
  createContactAction,
  deleteContactAction,
  deleteNoteAction,
  markContactedAction,
  skipContactAction,
  undoKeepInTouchAction,
  updateContactAction,
  updateNoteAction,
} from "@/app/contacts/actions";
import {
  addGroupAction,
  createGroupFormAction,
  deleteGroupAction,
  renameGroupAction,
} from "@/app/groups/actions";

let contactId: number;
let noteId: number;
let groupId: number;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const idle = { status: "idle" as const };
const validContact = { name: "Взломанный контакт" };
const validNote = { body: "Взломанная заметка", notedOn: "2026-01-01" };

// Everything the actions can touch
async function snapshot() {
  return {
    users: await db.select().from(users).orderBy(users.id),
    contacts: await db.select().from(contacts).orderBy(contacts.id),
    notes: await db.select().from(notes).orderBy(notes.id),
    groups: await db.select().from(groups).orderBy(groups.id),
    links: await db.select().from(contactGroups),
    sessions: await db.select().from(sessions),
  };
}

// What requireUserId() does without a session: sends to the sign-in page
async function expectSentToSignIn(call: Promise<unknown>) {
  await expect(call).rejects.toMatchObject({
    digest: expect.stringContaining("/login"),
  });
}

const actions: [string, () => Promise<unknown>][] = [
  ["createContactAction", () => createContactAction(idle, form(validContact))],
  [
    "updateContactAction",
    () => updateContactAction(contactId, idle, form(validContact)),
  ],
  ["deleteContactAction", () => deleteContactAction(contactId)],
  [
    "addNoteAction",
    () => addNoteAction(contactId, { status: "idle" }, form(validNote)),
  ],
  [
    "updateNoteAction",
    () => updateNoteAction(noteId, { status: "idle" }, form(validNote)),
  ],
  ["deleteNoteAction", () => deleteNoteAction(noteId)],
  ["markContactedAction", () => markContactedAction(contactId)],
  ["skipContactAction", () => skipContactAction(contactId)],
  [
    "undoKeepInTouchAction",
    () =>
      undoKeepInTouchAction(contactId, "contacted", {
        applied: "2026-01-01",
        previous: null,
      }),
  ],
  ["addGroupAction", () => addGroupAction("Взломанная группа")],
  [
    "createGroupFormAction",
    () =>
      createGroupFormAction(
        { status: "idle" },
        form({ name: "Взломанная группа" }),
      ),
  ],
  [
    "renameGroupAction",
    () =>
      renameGroupAction(
        groupId,
        { status: "idle" },
        form({ name: "Взломана" }),
      ),
  ],
  ["deleteGroupAction", () => deleteGroupAction(groupId)],
];

beforeEach(async () => {
  request.cookie = "";
  revalidated.calls = 0;
  await db.execute(sql.raw(truncateAllTables));
  const owner = await createTestUser("anna@example.com");
  const group = await createGroup(owner, "Теннис");
  groupId = group.id;
  contactId = await createContact(owner, {
    name: "Анна Смирнова",
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
    frequency: "week",
    note: "Первая заметка",
    groupIds: [group.id],
  });
  noteId = (await listNotes(owner, contactId))[0].id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("a request without a session", () => {
  it.each(actions)(
    "%s: sent to sign-in, nothing changes",
    async (_name, run) => {
      const before = await snapshot();

      await expectSentToSignIn(run());

      expect(await snapshot()).toEqual(before);
      expect(revalidated.calls).toBe(0);
    },
  );
});

describe("a request with a cookie that is not a session", () => {
  it.each(actions)("%s: the same", async (_name, run) => {
    // Looks like a session cookie, but no such session exists
    request.cookie = "better-auth.session_token=forged.value";
    const before = await snapshot();

    await expectSentToSignIn(run());

    expect(await snapshot()).toEqual(before);
    expect(revalidated.calls).toBe(0);
  });
});
