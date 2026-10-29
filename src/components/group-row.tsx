"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { deleteGroupAction, renameGroupAction } from "@/app/groups/actions";
import { DeleteFooter } from "@/components/delete-contact-button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatContactCount, type GroupFormState } from "@/lib/group-form";

const initialState: GroupFormState = { status: "idle" };

type GroupRowProps = {
  group: { id: number; name: string; contactCount: number };
};

export function GroupRow({ group }: GroupRowProps) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid gap-3 rounded-xl border-[1.5px] border-border bg-card px-4.5 py-3.5">
      {editing ? (
        <RenameForm group={group} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <Link
              href={`/?group=${group.id}`}
              className="font-semibold break-words underline-offset-4 hover:underline"
            >
              {group.name}
            </Link>
            <p className="text-sm text-muted-foreground">
              {formatContactCount(group.contactCount)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Переименовать
            </Button>
            <DeleteGroupButton group={group} />
          </div>
        </div>
      )}
    </div>
  );
}

function RenameForm({
  group,
  onDone,
}: {
  group: GroupRowProps["group"];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prevState: GroupFormState, formData: FormData) => {
      const next = await renameGroupAction(group.id, prevState, formData);
      // The field stays open on an error and closes once the name is saved
      if (next.status === "saved") {
        onDone();
      }
      return next;
    },
    initialState,
  );
  const errorId = `group-${group.id}-error`;
  return (
    <form action={formAction} className="grid gap-1.5" noValidate>
      <div className="flex flex-wrap gap-2">
        <Input
          // A new key remounts the field to show what was typed after an error
          key={state.value ?? group.name}
          name="name"
          aria-label={`Новое название группы «${group.name}»`}
          defaultValue={state.value ?? group.name}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          autoFocus
          className="max-w-xs flex-1"
        />
        <Button type="submit" size="sm" className="h-11" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11"
          disabled={pending}
          onClick={onDone}
        >
          Отмена
        </Button>
      </div>
      {state.error && (
        <p id={errorId} className="px-1 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

function DeleteGroupButton({ group }: GroupRowProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 aria-hidden="true" data-icon="inline-start" />
        Удалить
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить группу?</AlertDialogTitle>
          <AlertDialogDescription>
            Группа{" "}
            <span className="font-semibold break-words text-foreground">
              «{group.name}»
            </span>{" "}
            ({formatContactCount(group.contactCount)}) будет удалена. Контакты
            останутся, но уже не будут в этой группе. Это нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={deleteGroupAction.bind(null, group.id)}>
          <DeleteFooter />
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
