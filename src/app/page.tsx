import Link from "next/link";
import { Suspense } from "react";

import { ContactSearch } from "@/components/contact-search";
import { ContactsTable } from "@/components/contacts-table";
import { buttonVariants } from "@/components/ui/button";
import { listContacts } from "@/lib/contacts";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Контакты</h1>
        <Link href="/contacts/new" className={buttonVariants()}>
          Добавить контакт
        </Link>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Загружаю контакты…</p>}>
        <ContactsSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ContactsSection({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const { q } = await searchParams;
  const search = (typeof q === "string" ? q : "").trim();
  const contacts = await listContacts(search);

  return (
    <div className="grid gap-4">
      {/* key resets the input when the query changes, e.g. after "Сбросить" */}
      <ContactSearch key={search} defaultValue={search} />
      <p className="text-sm text-muted-foreground">
        {search
          ? `Найдено по запросу «${search}»: ${contacts.length}`
          : `Всего контактов: ${contacts.length}`}
      </p>
      {contacts.length > 0 ? (
        <ContactsTable contacts={contacts} />
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {search
            ? "Никого не нашли. Попробуйте написать имя иначе."
            : "Пока нет ни одного контакта. Нажмите «Добавить контакт»."}
        </p>
      )}
    </div>
  );
}
