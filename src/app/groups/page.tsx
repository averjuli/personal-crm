import { Suspense } from "react";

import { BackToList } from "@/components/back-to-list";
import { GroupRow } from "@/components/group-row";
import { NewGroupForm } from "@/components/new-group-form";
import { listGroups } from "@/lib/contacts";

export default function GroupsPage() {
  return (
    <div className="grid max-w-2xl gap-6">
      <BackToList />
      <h1 className="font-heading text-title font-medium lg:text-title-lg">
        Группы
      </h1>
      <Suspense
        fallback={<p className="text-muted-foreground">Загружаю группы…</p>}
      >
        <GroupsSection />
      </Suspense>
    </div>
  );
}

async function GroupsSection() {
  const groups = await listGroups();
  return (
    <div className="grid gap-4">
      <NewGroupForm />
      {groups.length > 0 ? (
        <ul className="grid gap-2.5">
          {groups.map((group) => (
            <li key={group.id}>
              <GroupRow group={group} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border-[1.5px] border-dashed border-border-dashed bg-card p-8 text-center text-muted-foreground">
          Групп пока нет
        </p>
      )}
    </div>
  );
}
