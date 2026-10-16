import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackToList } from "@/components/back-to-list";
import { ContactForm } from "@/components/contact-form";
import { StatusPill } from "@/components/status-pill";
import { getContact } from "@/lib/contacts";
import { initials } from "@/lib/initials";

export default function ContactPage(props: PageProps<"/contacts/[id]">) {
  return (
    <div className="grid max-w-2xl gap-6">
      <BackToList />
      <Suspense fallback={<p className="text-muted-foreground">Загружаю контакт…</p>}>
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

  const contact = await getContact(contactId);
  if (!contact) {
    notFound();
  }

  const { created } = await searchParams;

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
        contact={{
          id: contact.id,
          values: {
            name: contact.name,
            about: contact.about ?? "",
            howWeMet: contact.howWeMet ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
            notes: contact.notes ?? "",
          },
        }}
      />
    </>
  );
}
