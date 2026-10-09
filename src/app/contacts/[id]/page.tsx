import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackToList } from "@/components/back-to-list";
import { ContactForm } from "@/components/contact-form";
import { getContact } from "@/lib/contacts";

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
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold break-words">{contact.name}</h1>
        {created === "1" && (
          <p role="status" className="text-sm text-muted-foreground">
            Контакт добавлен. Он уже есть в общем списке.
          </p>
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
