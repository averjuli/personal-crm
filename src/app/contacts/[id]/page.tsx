import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { BackToList } from "@/components/back-to-list";
import { ContactForm } from "@/components/contact-form";
import { ContactNotes } from "@/components/contact-notes";
import { DeleteContactButton } from "@/components/delete-contact-button";
import { StatusPill } from "@/components/status-pill";
import { getContact, listGroups, listNotes } from "@/lib/contacts";
import { initials } from "@/lib/initials";
import {
  formatDay,
  formatOverdue,
  todayInAppTimeZone,
} from "@/lib/keep-in-touch";

export default function ContactPage(props: PageProps<"/contacts/[id]">) {
  return (
    <div className="grid max-w-2xl gap-6">
      <BackToList />
      <Suspense
        fallback={<p className="text-muted-foreground">Загружаю контакт…</p>}
      >
        <ContactDetails {...props} />
      </Suspense>
    </div>
  );
}

async function ContactDetails({
  params,
  searchParams,
}: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    notFound();
  }

  // getContact reads today's date from the clock, which Next allows only once
  // the card is rendered per request
  await connection();
  const contact = await getContact(contactId);
  if (!contact) {
    notFound();
  }

  const { created } = await searchParams;
  const [notes, groups] = await Promise.all([
    listNotes(contactId),
    listGroups(),
  ]);

  const keepInTouchLines = [
    contact.lastContactOn
      ? `Последнее общение: ${formatDay(contact.lastContactOn)}`
      : "Заметок ещё не было",
  ];
  if (contact.dueOn && contact.overdueDays !== null) {
    // Past the due day the line says how late it is instead of the day
    keepInTouchLines.push(
      contact.overdueDays > 0
        ? `Пора связаться: ${formatOverdue(contact.overdueDays)}`
        : contact.overdueDays === 0
          ? "Пора связаться: сегодня"
          : `Пора связаться: ${formatDay(contact.dueOn)}`,
    );
  }

  return (
    <>
      <div className="grid gap-4">
        <div className="flex items-center gap-3.5 lg:gap-4">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground bg-primary font-heading text-[0.9375rem] font-semibold lg:size-14 lg:text-[1.0625rem]"
          >
            {initials(contact.name)}
          </span>
          <h1 className="min-w-0 font-heading text-title font-medium break-words lg:text-title-lg">
            {contact.name}
          </h1>
        </div>
        {created === "1" && (
          <StatusPill role="status">
            Контакт добавлен. Он уже есть в общем списке.
          </StatusPill>
        )}
      </div>
      <ContactForm
        groups={groups}
        contact={{
          id: contact.id,
          values: {
            name: contact.name,
            about: contact.about ?? "",
            howWeMet: contact.howWeMet ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
            frequency: contact.frequency ?? "",
            note: "",
            groupIds: contact.groupIds.map(String),
          },
          keepInTouchLines,
        }}
      />
      <ContactNotes
        contactId={contact.id}
        notes={notes}
        today={todayInAppTimeZone()}
      />
      {/* Kept apart from "Сохранить", so it is not pressed by mistake */}
      <div className="border-t pt-6">
        <DeleteContactButton contact={{ id: contact.id, name: contact.name }} />
      </div>
    </>
  );
}
