export type Birthday = {
  birthDay: number | null;
  birthMonth: number | null;
  birthYear: number | null;
};

const birthdayFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatBirthdayDay(day: string) {
  return birthdayFormat.format(new Date(`${day}T00:00:00Z`));
}

export function parseBirthdayPart(value: string): number | null {
  if (!value) return null;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

export function isValidBirthday({
  birthDay: day,
  birthMonth: month,
  birthYear: year,
}: Birthday) {
  if (day === null && month === null && year === null) return true;
  if (day === null || month === null) return false;
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    return false;
  if (
    year !== null &&
    (!Number.isInteger(year) || year < 1 || year > 2_147_483_647)
  )
    return false;
  const calendarYear = year ?? 2000;
  const leap =
    calendarYear % 400 === 0 ||
    (calendarYear % 4 === 0 && calendarYear % 100 !== 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
