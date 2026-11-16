import Link from "next/link";

import { formatBirthdayDay } from "@/lib/birthdays";
import type { listUpcomingBirthdays } from "@/lib/contacts";

export function UpcomingBirthdays({
  contacts,
}: {
  contacts: Awaited<ReturnType<typeof listUpcomingBirthdays>>;
}) {
  return (
    <section aria-labelledby="birthdays-heading" className="grid gap-3">
      <h2 id="birthdays-heading" className="font-heading text-xl font-medium">
        Скоро день рождения
      </h2>
      <ul className="overflow-hidden rounded-2xl border bg-card">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0 md:px-5"
          >
            <Link
              href={`/contacts/${contact.id}`}
              className="min-w-0 font-semibold break-words underline-offset-4 hover:underline"
            >
              {contact.name}
            </Link>
            <time
              dateTime={contact.birthdayOn}
              className="shrink-0 text-sm text-muted-foreground"
            >
              {formatBirthdayDay(contact.birthdayOn)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
