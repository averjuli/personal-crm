import { Plus } from "lucide-react";
import Link from "next/link";

import { ContactSearch } from "@/components/contact-search";
import { ContactsTable } from "@/components/contacts-table";
import { buttonVariants } from "@/components/ui/button";
import { listContacts } from "@/lib/contacts";

// Render the list in the first HTML instead of streaming it behind a
// "loading" placeholder: the query takes milliseconds, while swapping
// 1000 streamed rows into the page cost a noticeable delay
export const instant = false;

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="grid gap-6 lg:gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-title font-medium lg:text-title-lg">
          Контакты
        </h1>
        <Link href="/contacts/new" className={buttonVariants()}>
          <Plus aria-hidden="true" strokeWidth={2.5} data-icon="inline-start" />
          Добавить контакт
        </Link>
      </div>
      <ContactsSection searchParams={searchParams} />
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
        <p className="rounded-2xl border-[1.5px] border-dashed border-border-dashed bg-card p-8 text-center text-muted-foreground">
          {search
            ? "Никого не нашли. Попробуйте написать имя иначе."
            : "Пока нет ни одного контакта. Нажмите «Добавить контакт»."}
        </p>
      )}
    </div>
  );
}
