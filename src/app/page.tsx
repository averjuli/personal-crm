import { Plus, Tags } from "lucide-react";
import Link from "next/link";

import { ContactSearch } from "@/components/contact-search";
import { ContactsTable } from "@/components/contacts-table";
import { OverdueContacts } from "@/components/overdue-contacts";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import {
  hasContacts,
  listContacts,
  listGroups,
  listOverdueContacts,
} from "@/lib/contacts";
import { findSelectedGroup } from "@/lib/group-filter";
import { requireUserId } from "@/lib/session";

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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/groups"
            className={buttonVariants({ variant: "outline" })}
          >
            <Tags aria-hidden="true" data-icon="inline-start" />
            Группы
          </Link>
          <Link href="/contacts/new" className={buttonVariants()}>
            <Plus
              aria-hidden="true"
              strokeWidth={2.5}
              data-icon="inline-start"
            />
            Добавить контакт
          </Link>
        </div>
      </div>
      <ContactsSection searchParams={searchParams} />
    </div>
  );
}

async function ContactsSection({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const ownerId = await requireUserId();
  const { q, group, deleted } = await searchParams;
  const search = (typeof q === "string" ? q : "").trim();
  const groups = await listGroups(ownerId);
  // An unknown, broken or foreign ?group= means "Все группы"
  const selectedGroup = findSelectedGroup(groups, group);
  const groupId = selectedGroup?.id ?? null;
  // The "time to reach out" block is hidden while searching and is not
  // filtered by group
  const [contacts, overdue, anyContacts] = await Promise.all([
    listContacts(ownerId, search, groupId),
    search ? null : listOverdueContacts(ownerId),
    hasContacts(ownerId),
  ]);

  return (
    <div className="grid gap-4">
      {deleted === "1" && (
        <StatusPill role="status">Контакт удалён.</StatusPill>
      )}
      {/* Someone without a single contact has nobody to keep in touch with */}
      {overdue && anyContacts && <OverdueContacts contacts={overdue} />}
      {/* key resets the controls when the query changes, e.g. after "Сбросить" */}
      <ContactSearch
        key={`${search}|${groupId}`}
        defaultValue={search}
        groups={groups}
        groupId={groupId}
      />
      <p className="text-sm text-muted-foreground">
        {search
          ? `Найдено по запросу «${search}»${selectedGroup ? ` в группе «${selectedGroup.name}»` : ""}: ${contacts.length}`
          : selectedGroup
            ? `В группе «${selectedGroup.name}»: ${contacts.length}`
            : `Всего контактов: ${contacts.length}`}
      </p>
      {contacts.length > 0 ? (
        <ContactsTable contacts={contacts} />
      ) : (
        <p className="rounded-2xl border-[1.5px] border-dashed border-border-dashed bg-card p-8 text-center text-muted-foreground">
          {search
            ? "Никого не нашли. Попробуйте написать имя иначе."
            : selectedGroup
              ? "В этой группе пока нет контактов"
              : "Пока нет ни одного контакта. Добавь первый контакт."}
        </p>
      )}
    </div>
  );
}
