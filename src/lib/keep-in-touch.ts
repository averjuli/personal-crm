import type { ContactFrequency } from "@/db/schema";

// "Today" and all due dates are counted in this time zone, whatever the
// time zone of the server or the database is
export const APP_TIME_ZONE = "Europe/Moscow";

export const frequencyLabels: Record<ContactFrequency, string> = {
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в квартал",
  year: "Раз в год",
};

// Today's calendar day in the app time zone as YYYY-MM-DD
export function todayInAppTimeZone() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const dayFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// "2026-10-12" -> "12 октября 2026". A day string has no time zone, so it is
// formatted in UTC to keep the day from shifting
export function formatDay(day: string) {
  // ru-RU appends " г." to the year
  return dayFormat.format(new Date(`${day}T00:00:00Z`)).replace(/\s*г\.$/, "");
}

const pluralRules = new Intl.PluralRules("ru");

function daysWord(count: number) {
  switch (pluralRules.select(count)) {
    case "one":
      return "день";
    case "few":
      return "дня";
    default:
      return "дней";
  }
}

// overdueDays is today minus the due day, so 0 means "due today"
export function formatOverdue(overdueDays: number) {
  if (overdueDays <= 0) {
    return "пора сегодня";
  }
  return `просрочено на ${overdueDays} ${daysWord(overdueDays)}`;
}
