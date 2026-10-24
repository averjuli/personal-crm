"use client";

import { Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";

import { deleteContactAction } from "@/app/contacts/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type DeleteContactButtonProps = {
  contact: { id: number; name: string };
};

export function DeleteContactButton({ contact }: DeleteContactButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash2 aria-hidden="true" data-icon="inline-start" />
        Удалить контакт
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить контакт?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-semibold break-words text-foreground">
              {contact.name}
            </span>{" "}
            пропадёт из списка вместе с заметками. Это нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={deleteContactAction.bind(null, contact.id)}>
          <DeleteFooter />
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const arrowKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

// Any arrow key moves focus to the other button; Enter presses the focused
// one, as with any button
function switchButton(event: KeyboardEvent<HTMLDivElement>) {
  if (!arrowKeys.includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll("button")];
  const other = buttons.find((button) => button !== document.activeElement);
  if (!other) return;
  event.preventDefault();
  other.focus();
}

// Inside the form, so both buttons know the delete is in progress
function DeleteFooter() {
  const { pending } = useFormStatus();
  return (
    <AlertDialogFooter onKeyDown={switchButton}>
      {/* Cancel comes first, so the dialog opens with focus on it */}
      <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
      <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
        {pending ? "Удаляю…" : "Удалить"}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}
