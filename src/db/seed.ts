// Fills an empty database with realistic test contacts: `pnpm db:seed`
import { fakerRU as faker } from "@faker-js/faker";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  contactFrequencies,
  contacts,
  notes,
  type NewContact,
} from "./schema";

const CONTACT_COUNT = 1000;

// [male, female] variants of "who is this"
const ABOUT: [string, string][] = [
  ["Коллега по прошлой работе", "Коллега по прошлой работе"],
  ["Коллега из соседнего отдела", "Коллега из соседнего отдела"],
  ["Однокурсник", "Однокурсница"],
  ["Одноклассник", "Одноклассница"],
  ["Друг детства", "Подруга детства"],
  ["Сосед по подъезду", "Соседка по подъезду"],
  ["Сосед по даче", "Соседка по даче"],
  ["Бывший руководитель", "Бывшая руководительница"],
  ["Наставник", "Наставница"],
  ["Партнёр по проекту", "Партнёр по проекту"],
  ["Тренер в спортзале", "Тренер по йоге"],
  ["Стоматолог", "Стоматолог"],
  ["Врач-терапевт", "Врач-терапевт"],
  ["Юрист", "Юрист"],
  ["Бухгалтер", "Бухгалтер"],
  ["Риелтор", "Риелтор"],
  ["Фотограф", "Фотограф"],
  ["Дизайнер, делал нам логотип", "Дизайнер, делала нам логотип"],
  ["Преподаватель английского", "Преподаватель английского"],
  ["Автомеханик", "Парикмахер"],
  ["Мастер по ремонту", "Мастер маникюра"],
  ["Владелец кофейни у дома", "Владелица кофейни у дома"],
  ["Отец одноклассника сына", "Мама одноклассницы дочери"],
  ["Рекрутер", "Рекрутер"],
  ["Организатор митапов", "Организатор митапов"],
  ["Друг брата", "Подруга сестры"],
];

const HOW_WE_MET = [
  "Учились вместе в университете",
  "Работали вместе на прошлой работе",
  "Познакомил общий друг",
  "Курсы английского",
  "Конференция по продуктовому менеджменту, 2024",
  "Митап по аналитике",
  "Свадьба друзей",
  "День рождения общей подруги",
  "Чат жильцов дома",
  "Спортзал у дома",
  "Летний лагерь в детстве",
  "Отпуск в Сочи, 2022",
  "Командировка в Казань",
  "Волонтёрский проект",
  "Родительское собрание в школе",
  "Чат выпускников в Telegram",
  "Хакатон",
  "Книжный клуб",
  "По объявлению",
  "Курсы фотографии",
  "Тренировки по бегу в парке",
  "Мастер-класс по керамике",
  "Походы выходного дня",
  "Соседи по даче",
];

const NOTES = [
  "Договорились созвониться в следующую пятницу.",
  "Обещали друг другу встретиться на кофе после праздников.",
  "Ждёт от меня презентацию проекта.",
  "Поздравить с днём рождения в марте.",
  "Интересуется походами — позвать в следующий раз.",
  "Спросить, как прошёл переезд.",
  "Советует книгу «Атомные привычки» — купить.",
  "Может помочь с ремонтом балкона.",
  "Есть общий проект в планах — вернуться к разговору осенью.",
  "Любит хороший чай, на встречу можно взять в подарок.",
  "Двое детей, старший пошёл в школу.",
  "Ищет работу в маркетинге — держать в курсе вакансий.",
  "Договорились обменяться контактами врачей.",
  "Последний раз виделись на дне рождения у общих друзей.",
  "Отправить фотографии с поездки.",
  "Нужно вернуть книгу.",
  "Удобно созваниваться вечером, после 19:00.",
  "Недавно переезд в Петербург — спросить, как обустройство.",
  "Зовёт на открытие выставки в ноябре.",
  "Обсудили идею совместного подкаста.",
];

const EMAIL_DOMAINS = ["gmail.com", "yandex.ru", "mail.ru", "outlook.com", "icloud.com"];

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(value: string) {
  return [...value.toLowerCase()]
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

function makeEmail(firstName: string, lastName: string) {
  const first = transliterate(firstName);
  const last = transliterate(lastName);
  const local = faker.helpers.arrayElement([
    `${first}.${last}`,
    `${first[0]}.${last}`,
    `${last}${faker.number.int({ min: 70, max: 99 })}`,
    `${first}_${last}`,
  ]);
  return `${local}@${faker.helpers.arrayElement(EMAIL_DOMAINS)}`;
}

function makePhone() {
  const digits = faker.string.numeric(9);
  return `+7 (9${digits.slice(0, 2)}) ${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7)}`;
}

// A calendar day as YYYY-MM-DD
function toDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function makeNotes() {
  return faker.helpers
    .arrayElements(NOTES, { min: 1, max: 3 })
    .map((body) => ({ body, notedOn: toDay(faker.date.past({ years: 2 })) }));
}

function makeContact(): { contact: NewContact; notes: { body: string; notedOn: string }[] } {
  const sex = faker.person.sexType();
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);
  const [aboutMale, aboutFemale] = faker.helpers.arrayElement(ABOUT);
  const createdAt = faker.date.past({ years: 3 });

  // About 5% of contacts get a frequency, set some time ago, so that the
  // "Time to reach out" block is not empty locally
  const hasFrequency = faker.datatype.boolean({ probability: 0.05 });

  const contact: NewContact = {
    name: `${firstName} ${lastName}`,
    about: faker.helpers.maybe(() => (sex === "male" ? aboutMale : aboutFemale), {
      probability: 0.9,
    }) ?? null,
    howWeMet: faker.helpers.maybe(() => faker.helpers.arrayElement(HOW_WE_MET), {
      probability: 0.8,
    }) ?? null,
    phone: faker.helpers.maybe(makePhone, { probability: 0.85 }) ?? null,
    email:
      faker.helpers.maybe(() => makeEmail(firstName, lastName), { probability: 0.7 }) ??
      null,
    contactFrequency: hasFrequency
      ? faker.helpers.arrayElement(contactFrequencies)
      : null,
    frequencySetOn: hasFrequency
      ? toDay(faker.date.recent({ days: 90 }))
      : null,
    createdAt,
    updatedAt: createdAt,
  };
  const contactNotes = faker.helpers.maybe(makeNotes, { probability: 0.55 }) ?? [];
  return { contact, notes: contactNotes };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    process.loadEnvFile();
  }
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  try {
    const [{ value: existing }] = await db.select({ value: count() }).from(contacts);
    if (existing > 0) {
      console.log(`Seed skipped: the contacts table already has ${existing} rows.`);
      return;
    }

    faker.seed(20261009);
    const generated = Array.from({ length: CONTACT_COUNT }, makeContact);
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(contacts)
        .values(generated.map((item) => item.contact))
        .returning({ id: contacts.id });
      // Identity ids are returned in the order of the inserted rows
      const noteRows = generated.flatMap((item, index) =>
        item.notes.map((note) => ({ ...note, contactId: inserted[index].id })),
      );
      await tx.insert(notes).values(noteRows);
      console.log(
        `Seed done: inserted ${inserted.length} contacts and ${noteRows.length} notes.`,
      );
    });
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
