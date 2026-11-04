import { Suspense } from "react";

import { BackToList } from "@/components/back-to-list";
import { ContactForm } from "@/components/contact-form";
import { listGroups } from "@/lib/contacts";
import { requireUserId } from "@/lib/session";

export default function NewContactPage() {
  return (
    <div className="grid max-w-2xl gap-6">
      <BackToList />
      <h1 className="font-heading text-title font-medium lg:text-title-lg">
        Новый контакт
      </h1>
      <Suspense
        fallback={<p className="text-muted-foreground">Загружаю форму…</p>}
      >
        <NewContactForm />
      </Suspense>
    </div>
  );
}

async function NewContactForm() {
  const ownerId = await requireUserId();
  return <ContactForm groups={await listGroups(ownerId)} />;
}
