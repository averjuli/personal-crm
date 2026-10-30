// Scenarios of openspec/specs/keep-in-touch/spec.md, checked against a real
// database. "Today" is set with fake timers: the app counts it from its clock
import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { db } from "@/db";
import type { ContactFrequency } from "@/db/schema";
import {
  addNote,
  createContact,
  deleteNote,
  getContact,
  listContacts,
  listNotes,
  listOverdueContacts,
  markKeepInTouch,
  undoKeepInTouch,
  updateContact,
  updateNote,
} from "@/lib/contacts";
import { formatOverdue, frequencyLabels } from "@/lib/keep-in-touch";

import { truncateAllTables } from "../../testing/database";

type TestContact = { id: number; name: string };

// Noon in Moscow, so the day is the same in every time zone of the machine
function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T12:00:00+03:00`));
}

// "2026-10-24" plus a number of days, as YYYY-MM-DD
function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function newContact(
  name: string,
  frequency: ContactFrequency | null = null,
): Promise<TestContact> {
  const id = await createContact({
    name,
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
    frequency,
    note: null,
    groupIds: [],
  });
  return { id, name };
}

async function setFrequency(
  contact: TestContact,
  frequency: ContactFrequency | null,
) {
  await updateContact(contact.id, {
    name: contact.name,
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
    frequency,
    groupIds: [],
  });
}

async function note(
  contact: TestContact,
  notedOn: string,
  body = "Созвонились",
) {
  await addNote(contact.id, { body, notedOn });
}

async function card(contact: TestContact) {
  return (await getContact(contact.id))!;
}

async function overdueNames() {
  return (await listOverdueContacts()).map((row) => row.name);
}

async function overdueRow(contact: TestContact) {
  return (await listOverdueContacts()).find((row) => row.id === contact.id);
}

// A contact with the frequency set long ago and the last note on the given day
async function contactWithNote(
  name: string,
  frequency: ContactFrequency,
  notedOn: string,
) {
  const today = new Date();
  setToday("2026-01-01");
  const contact = await newContact(name, frequency);
  vi.setSystemTime(today);
  await note(contact, notedOn);
  return contact;
}

beforeEach(async () => {
  await db.execute(sql.raw(truncateAllTables));
  vi.useFakeTimers({ toFake: ["Date"] });
  setToday("2026-10-24");
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.$client.end();
});

describe("contact frequency", () => {
  it("keeps the frequency chosen in the card", async () => {
    const contact = await newContact("Анна Смирнова");
    await setFrequency(contact, "month");
    expect((await card(contact)).frequency).toBe("month");
  });

  it("keeps the frequency chosen for a new contact", async () => {
    const contact = await newContact("Анна Смирнова", "week");
    expect((await card(contact)).frequency).toBe("week");
  });

  it("«Не задано» removes the frequency and the contact leaves the block", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "week",
      "2026-10-01",
    );
    expect(await overdueNames()).toEqual(["Анна Смирнова"]);

    await setFrequency(contact, null);

    const updated = await card(contact);
    expect(updated.frequency).toBeNull();
    expect(updated.dueOn).toBeNull();
    expect(await overdueNames()).toEqual([]);
  });
});

describe("last communication", () => {
  it("is the note when it is later than the mark", async () => {
    const contact = await newContact("Анна Смирнова", "week");
    setToday("2026-10-10");
    await markKeepInTouch(contact.id, "contacted");
    await note(contact, "2026-10-20");
    setToday("2026-10-24");

    expect((await card(contact)).lastContactOn).toBe("2026-10-20");
  });

  it("is the mark when it is later than the note", async () => {
    const contact = await newContact("Анна Смирнова", "week");
    await note(contact, "2026-10-01");
    await markKeepInTouch(contact.id, "contacted");

    expect((await card(contact)).lastContactOn).toBe("2026-10-24");
  });

  it("does not change on a skip", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "month",
      "2026-09-12",
    );
    await markKeepInTouch(contact.id, "skipped");

    expect((await card(contact)).lastContactOn).toBe("2026-09-12");
  });
});

describe("countdown start", () => {
  it("a new note starts the countdown again", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "month",
      "2026-09-01",
    );
    expect(await overdueNames()).toEqual(["Анна Смирнова"]);

    await note(contact, "2026-10-24");

    expect(await overdueNames()).toEqual([]);
    expect((await card(contact)).dueOn).toBe("2026-11-24");
  });

  it("a back-dated note starts the countdown from its date", async () => {
    const contact = await newContact("Анна Смирнова", "week");
    await note(contact, addDays("2026-10-24", -10));

    expect((await overdueRow(contact))?.overdueDays).toBe(3);
  });

  it("editing the text of the last note does not move the due day", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "week",
      "2026-10-20",
    );
    const [last] = await listNotes(contact.id);

    await updateNote(last.id, { body: "Другой текст", notedOn: "2026-10-20" });

    expect((await card(contact)).dueOn).toBe("2026-10-27");
  });

  it("editing the date of the last note moves the due day", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "week",
      "2026-10-05",
    );
    await note(contact, "2026-10-20");
    const [last] = await listNotes(contact.id);

    await updateNote(last.id, { body: last.body, notedOn: "2026-10-01" });

    // The latest note is now the one of 5 October
    expect((await card(contact)).dueOn).toBe("2026-10-12");
  });

  it("deleting the latest note falls back to the mark and the other notes", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "month",
      "2026-10-05",
    );
    setToday("2026-10-10");
    await markKeepInTouch(contact.id, "contacted");
    setToday("2026-10-24");
    await note(contact, "2026-10-20");
    const [latest] = await listNotes(contact.id);

    await deleteNote(latest.id);

    // The mark of 10 October is later than the note of 5 October
    expect((await card(contact)).dueOn).toBe("2026-11-10");
  });

  it("deleting the only note falls back to the day the frequency was set", async () => {
    setToday("2026-09-01");
    const contact = await newContact("Анна Смирнова", "month");
    setToday("2026-10-24");
    await note(contact, "2026-10-20");
    const [only] = await listNotes(contact.id);

    await deleteNote(only.id);

    expect((await card(contact)).dueOn).toBe("2026-10-01");
  });

  it("without notes the countdown starts on the day the frequency was set", async () => {
    await newContact("Анна Смирнова", "week");

    setToday("2026-10-30");
    expect(await overdueNames()).toEqual([]);
    setToday("2026-10-31");
    expect(await overdueNames()).toEqual(["Анна Смирнова"]);
  });

  it("changing one frequency to another keeps the countdown start", async () => {
    setToday(addDays("2026-10-24", -20));
    const contact = await newContact("Анна Смирнова", "month");
    setToday("2026-10-24");

    await setFrequency(contact, "week");

    expect((await overdueRow(contact))?.overdueDays).toBe(13);
  });

  it("a skip later than the last communication starts the countdown", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "week",
      addDays("2026-10-24", -20),
    );

    await markKeepInTouch(contact.id, "skipped");

    expect((await card(contact)).dueOn).toBe("2026-10-31");
  });

  it("«Не задано» forgets the skip", async () => {
    setToday("2026-10-01");
    const contact = await newContact("Анна Смирнова", "week");
    setToday(addDays("2026-10-24", -3));
    await markKeepInTouch(contact.id, "skipped");
    await setFrequency(contact, null);
    setToday("2026-10-24");

    await setFrequency(contact, "week");

    expect((await card(contact)).dueOn).toBe("2026-10-31");
  });
});

describe("due day", () => {
  it("is due today exactly a month after the last note", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "month",
      "2026-09-12",
    );
    setToday("2026-10-12");

    expect((await overdueRow(contact))?.overdueDays).toBe(0);
    expect(formatOverdue(0)).toBe("пора сегодня");
  });

  it("is not due the day before", async () => {
    await contactWithNote("Анна Смирнова", "month", "2026-09-12");
    setToday("2026-10-11");

    expect(await overdueNames()).toEqual([]);
  });

  it("a month from the 31st ends on the last day of a shorter month", async () => {
    setToday("2027-01-31");
    const contact = await contactWithNote(
      "Анна Смирнова",
      "month",
      "2027-01-31",
    );

    expect((await card(contact)).dueOn).toBe("2027-02-28");
  });

  it("a quarter is three months", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "quarter",
      "2026-07-15",
    );

    expect((await card(contact)).dueOn).toBe("2026-10-15");
  });
});

describe("«Пора связаться» block", () => {
  it("shows only the overdue contacts", async () => {
    await contactWithNote("Анна Смирнова", "week", "2026-10-01");
    await contactWithNote("Борис Кузнецов", "month", "2026-09-01");
    await contactWithNote("Вера Ким", "week", "2026-10-20");

    expect(await overdueNames()).toEqual(["Борис Кузнецов", "Анна Смирнова"]);
  });

  it("is empty when nobody is overdue", async () => {
    await contactWithNote("Анна Смирнова", "week", "2026-10-20");
    await newContact("Борис Кузнецов");

    expect(await overdueNames()).toEqual([]);
  });

  it("puts the most overdue contact first", async () => {
    // Weekly: overdue days = today - (note + 7)
    await contactWithNote("Анна", "week", addDays("2026-10-24", -7 - 3));
    await contactWithNote("Борис", "week", addDays("2026-10-24", -7 - 40));
    await contactWithNote("Вера", "week", addDays("2026-10-24", -7 - 10));

    expect(await overdueNames()).toEqual(["Борис", "Вера", "Анна"]);
  });

  it("sorts contacts equally overdue by name", async () => {
    await contactWithNote("Вера", "week", addDays("2026-10-24", -7 - 5));
    await contactWithNote("Анна", "week", addDays("2026-10-24", -7 - 5));

    expect(await overdueNames()).toEqual(["Анна", "Вера"]);
  });

  it("a row has the frequency and how overdue the contact is", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "week",
      addDays("2026-10-24", -7 - 2),
    );

    const row = (await overdueRow(contact))!;
    expect(row.name).toBe("Анна Смирнова");
    expect(frequencyLabels[row.frequency!]).toBe("Раз в неделю");
    expect(formatOverdue(row.overdueDays)).toBe("просрочено на 2 дня");
  });
});

describe("«Уже связался»", () => {
  it("marks today as a communication without touching the notes", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "week",
      addDays("2026-10-24", -7 - 5),
    );
    const notesBefore = await listNotes(contact.id);

    await markKeepInTouch(contact.id, "contacted");

    expect(await overdueNames()).toEqual([]);
    const updated = await card(contact);
    expect(updated.lastContactOn).toBe("2026-10-24");
    expect(updated.dueOn).toBe("2026-10-31");
    expect(await listNotes(contact.id)).toEqual(notesBefore);
  });
});

describe("«Пропустить этот раз»", () => {
  it("moves the due day without changing the last communication", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "month",
      "2026-09-12",
    );

    await markKeepInTouch(contact.id, "skipped");

    expect(await overdueNames()).toEqual([]);
    const updated = await card(contact);
    expect(updated.frequency).toBe("month");
    expect(updated.lastContactOn).toBe("2026-09-12");
    expect(updated.dueOn).toBe("2026-11-24");
  });

  it("the contact comes back a period after the skip", async () => {
    setToday("2026-10-01");
    const contact = await newContact("Анна Смирнова", "week");
    setToday("2026-10-24");
    await markKeepInTouch(contact.id, "skipped");

    setToday("2026-10-30");
    expect(await overdueNames()).toEqual([]);
    setToday("2026-10-31");
    expect((await overdueRow(contact))?.overdueDays).toBe(0);
  });
});

describe("undo", () => {
  it("undoing «Уже связался» brings back the previous mark", async () => {
    const contact = await contactWithNote("Борис Орлов", "week", "2026-10-05");
    setToday("2026-10-14");
    await markKeepInTouch(contact.id, "contacted");
    setToday("2026-10-24");
    const before = await card(contact);
    const overdueBefore = (await overdueRow(contact))!.overdueDays;

    const change = (await markKeepInTouch(contact.id, "contacted"))!;
    expect(await overdueNames()).toEqual([]);
    await undoKeepInTouch(contact.id, "contacted", change);

    expect((await overdueRow(contact))?.overdueDays).toBe(overdueBefore);
    expect((await card(contact)).lastContactOn).toBe(before.lastContactOn);
  });

  it("undoing «Пропустить этот раз» brings back the previous due day", async () => {
    const contact = await contactWithNote("Вера Ким", "month", "2026-09-12");
    const before = await card(contact);
    const overdueBefore = (await overdueRow(contact))!.overdueDays;

    const change = (await markKeepInTouch(contact.id, "skipped"))!;
    expect(await overdueNames()).toEqual([]);
    await undoKeepInTouch(contact.id, "skipped", change);

    expect((await overdueRow(contact))?.overdueDays).toBe(overdueBefore);
    expect((await card(contact)).dueOn).toBe(before.dueOn);
  });
});

describe("frequency in the contact list", () => {
  it("lists the frequency, or nothing when it is not set", async () => {
    await newContact("Анна Смирнова", "year");
    await newContact("Борис Кузнецов");

    const rows = await listContacts("", null);
    expect(rows.map((row) => [row.name, row.frequency])).toEqual([
      ["Анна Смирнова", "year"],
      ["Борис Кузнецов", null],
    ]);
  });
});

describe("last and next communication in the card", () => {
  it("shows both days while the contact is not due", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "month",
      "2026-10-12",
    );

    const shown = await card(contact);
    expect(shown.lastContactOn).toBe("2026-10-12");
    expect(shown.dueOn).toBe("2026-11-12");
    expect(shown.overdueDays).toBeLessThan(0);
  });

  it("has no due day without a frequency", async () => {
    const contact = await newContact("Анна Смирнова");
    await note(contact, "2026-10-01");

    const shown = await card(contact);
    expect(shown.lastContactOn).toBe("2026-10-01");
    expect(shown.dueOn).toBeNull();
  });

  it("says how overdue the contact is", async () => {
    const contact = await contactWithNote(
      "Анна Смирнова",
      "week",
      "2026-10-10",
    );

    expect((await card(contact)).overdueDays).toBe(7);
  });

  it("counts the mark without notes as the last communication", async () => {
    const contact = await newContact("Анна Смирнова", "week");
    await markKeepInTouch(contact.id, "contacted");

    expect((await card(contact)).lastContactOn).toBe("2026-10-24");
  });
});
