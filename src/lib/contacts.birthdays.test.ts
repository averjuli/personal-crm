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
import type { ContactInput } from "@/lib/contact-form";
import {
  createContact,
  getContact,
  updateContact,
  listUpcomingBirthdays,
} from "@/lib/contacts";

import { truncateAllTables } from "../../testing/database";
import { createTestUser } from "../../testing/users";

let owner: string;

function input(birthday: Partial<ContactInput> = {}): ContactInput {
  return {
    name: "Anna",
    about: null,
    howWeMet: null,
    phone: null,
    email: null,
    birthDay: null,
    birthMonth: null,
    birthYear: null,
    frequency: null,
    note: null,
    groupIds: [],
    ...birthday,
  };
}

async function save(id: number, birthday: Partial<ContactInput>) {
  const { note, ...fields } = input(birthday);
  void note;
  return updateContact(owner, id, fields);
}

beforeEach(async () => {
  await db.execute(sql.raw(truncateAllTables));
  owner = await createTestUser("owner@example.com");
});

afterAll(async () => {
  await db.$client.end();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("saving birthdays", () => {
  it("creates a contact without a birthday", async () => {
    const id = await createContact(owner, input());
    expect(await getContact(owner, id)).toMatchObject({
      birthDay: null,
      birthMonth: null,
      birthYear: null,
    });
  });

  it("creates a birthday without a year", async () => {
    const id = await createContact(
      owner,
      input({ birthDay: 15, birthMonth: 11 }),
    );
    expect(await getContact(owner, id)).toMatchObject({
      birthDay: 15,
      birthMonth: 11,
      birthYear: null,
    });
  });

  it("creates a complete birth date", async () => {
    const id = await createContact(
      owner,
      input({ birthDay: 29, birthMonth: 2, birthYear: 2000 }),
    );
    expect(await getContact(owner, id)).toMatchObject({
      birthDay: 29,
      birthMonth: 2,
      birthYear: 2000,
    });
  });

  it("changes the day and month", async () => {
    const id = await createContact(
      owner,
      input({ birthDay: 20, birthMonth: 11 }),
    );
    expect(await save(id, { birthDay: 10, birthMonth: 12 })).toBe(true);
    expect(await getContact(owner, id)).toMatchObject({
      birthDay: 10,
      birthMonth: 12,
      birthYear: null,
    });
  });

  it("adds a birth year", async () => {
    const id = await createContact(
      owner,
      input({ birthDay: 15, birthMonth: 11 }),
    );
    await save(id, { birthDay: 15, birthMonth: 11, birthYear: 1990 });
    expect(await getContact(owner, id)).toMatchObject({
      birthDay: 15,
      birthMonth: 11,
      birthYear: 1990,
    });
  });

  it("removes only the birth year", async () => {
    const id = await createContact(
      owner,
      input({ birthDay: 15, birthMonth: 11, birthYear: 1990 }),
    );
    await save(id, { birthDay: 15, birthMonth: 11 });
    expect(await getContact(owner, id)).toMatchObject({
      birthDay: 15,
      birthMonth: 11,
      birthYear: null,
    });
  });

  it("clears the complete birthday", async () => {
    const id = await createContact(
      owner,
      input({ birthDay: 15, birthMonth: 11, birthYear: 1990 }),
    );
    await save(id, {});
    expect(await getContact(owner, id)).toMatchObject({
      birthDay: null,
      birthMonth: null,
      birthYear: null,
    });
  });
});

describe("upcoming birthdays", () => {
  function setToday(day: string) {
    vi.setSystemTime(new Date(`${day}T12:00:00+03:00`));
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setToday("2026-11-15");
  });

  it.each([
    ["today", 15, null, true],
    ["seven days without a birth year", 22, null, true],
    ["seven days with a birth year", 22, 1990, true],
    ["eight days", 23, null, false],
    ["yesterday", 14, null, false],
  ] as const)("handles %s", async (_name, birthDay, birthYear, included) => {
    const id = await createContact(
      owner,
      input({ birthDay, birthMonth: 11, birthYear }),
    );
    const rows = await listUpcomingBirthdays(owner);
    expect(rows.map((row) => row.id)).toEqual(included ? [id] : []);
  });

  it("excludes contacts without a birthday", async () => {
    await createContact(owner, input());
    expect(await listUpcomingBirthdays(owner)).toEqual([]);
  });

  it("crosses New Year in chronological order", async () => {
    setToday("2026-12-28");
    await createContact(
      owner,
      input({ name: "January", birthDay: 4, birthMonth: 1 }),
    );
    await createContact(
      owner,
      input({ name: "December", birthDay: 31, birthMonth: 12 }),
    );
    expect(
      (await listUpcomingBirthdays(owner)).map((row) => [
        row.name,
        row.birthdayOn,
      ]),
    ).toEqual([
      ["December", "2026-12-31"],
      ["January", "2027-01-04"],
    ]);
  });

  it("uses Moscow's calendar day at UTC midnight boundaries", async () => {
    vi.setSystemTime(new Date("2026-11-14T21:30:00Z"));
    await createContact(
      owner,
      input({ name: "Yesterday", birthDay: 14, birthMonth: 11 }),
    );
    await createContact(
      owner,
      input({ name: "Included", birthDay: 22, birthMonth: 11 }),
    );
    expect((await listUpcomingBirthdays(owner)).map((row) => row.name)).toEqual(
      ["Included"],
    );
  });

  it.each([2027, 2028, 2100, 2000])(
    "observes leap-day birthdays correctly in %i",
    async (year) => {
      setToday(`${year}-02-28`);
      const expectedDay = year === 2028 || year === 2000 ? "29" : "28";
      for (const birthYear of [null, 2000]) {
        const id = await createContact(
          owner,
          input({ birthDay: 29, birthMonth: 2, birthYear }),
        );
        expect(
          (await listUpcomingBirthdays(owner)).find((row) => row.id === id)
            ?.birthdayOn,
        ).toBe(`${year}-02-${expectedDay}`);
        expect(await getContact(owner, id)).toMatchObject({
          birthDay: 29,
          birthMonth: 2,
          birthYear,
        });
      }
    },
  );

  it("sorts nearest birthdays first", async () => {
    for (const [name, birthDay] of [
      ["Анна", 20],
      ["Борис", 15],
      ["Вера", 17],
    ] as const)
      await createContact(owner, input({ name, birthDay, birthMonth: 11 }));
    expect((await listUpcomingBirthdays(owner)).map((row) => row.name)).toEqual(
      ["Борис", "Вера", "Анна"],
    );
  });

  it("sorts equal dates alphabetically", async () => {
    for (const name of ["Вера", "Анна"])
      await createContact(owner, input({ name, birthDay: 20, birthMonth: 11 }));
    expect((await listUpcomingBirthdays(owner)).map((row) => row.name)).toEqual(
      ["Анна", "Вера"],
    );
  });

  it("reflects changes and clears immediately", async () => {
    const id = await createContact(
      owner,
      input({ birthDay: 20, birthMonth: 11 }),
    );
    expect(await listUpcomingBirthdays(owner)).toHaveLength(1);
    await save(id, { birthDay: 10, birthMonth: 12 });
    expect(await listUpcomingBirthdays(owner)).toEqual([]);
    await save(id, { birthDay: 15, birthMonth: 11 });
    expect(await listUpcomingBirthdays(owner)).toHaveLength(1);
    await save(id, {});
    expect(await listUpcomingBirthdays(owner)).toEqual([]);
  });
});
