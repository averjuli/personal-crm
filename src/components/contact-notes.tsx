"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import {
  addNoteAction,
  deleteNoteAction,
  updateNoteAction,
} from "@/app/contacts/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDay } from "@/lib/keep-in-touch";
import type { NoteField, NoteFormState } from "@/lib/note-form";

const initialState: NoteFormState = { status: "idle" };

type NoteItem = { id: number; body: string; notedOn: string };

type ContactNotesProps = {
  contactId: number;
  notes: NoteItem[];
  // Today as YYYY-MM-DD in the app time zone, decided on the server
  today: string;
};

export function ContactNotes({ contactId, notes, today }: ContactNotesProps) {
  return (
    <section
      aria-labelledby="notes-heading"
      className="grid gap-4 border-t pt-6"
    >
      <h2 id="notes-heading" className="font-heading text-xl font-medium">
        Заметки
      </h2>
      <AddNoteForm contactId={contactId} today={today} />
      {notes.length === 0 ? (
        <p className="text-muted-foreground">Заметок пока нет</p>
      ) : (
        <ul className="grid gap-2.5">
          {notes.map((note) => (
            <li key={note.id}>
              <Note note={note} today={today} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddNoteForm({
  contactId,
  today,
}: {
  contactId: number;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    addNoteAction.bind(null, contactId),
    initialState,
  );
  return (
    <form action={formAction} className="grid gap-2.5" noValidate>
      <NoteFields
        idPrefix="new-note"
        state={state}
        defaults={{ body: "", notedOn: today }}
        today={today}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Добавляю…" : "Добавить заметку"}
        </Button>
        <NoteFormMessage state={state} />
      </div>
    </form>
  );
}

function Note({ note, today }: { note: NoteItem; today: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid gap-3 rounded-xl border-[1.5px] border-border bg-card px-4.5 py-3.5">
      {editing ? (
        <EditNoteForm
          note={note}
          today={today}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="text-[0.8125rem] text-subtle-foreground">
            {formatDay(note.notedOn)}
          </p>
          <p className="break-words whitespace-pre-wrap">{note.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Изменить
            </Button>
            <DeleteNoteButton noteId={note.id} />
          </div>
        </>
      )}
    </div>
  );
}

function EditNoteForm({
  note,
  today,
  onDone,
}: {
  note: NoteItem;
  today: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prevState: NoteFormState, formData: FormData) => {
      const next = await updateNoteAction(note.id, prevState, formData);
      // Fields stay open on an error and close once the note is saved
      if (next.status === "saved") {
        onDone();
      }
      return next;
    },
    initialState,
  );
  return (
    <form action={formAction} className="grid gap-2.5" noValidate>
      <NoteFields
        idPrefix={`note-${note.id}`}
        state={state}
        defaults={{ body: note.body, notedOn: note.notedOn }}
        today={today}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onDone}
        >
          Отмена
        </Button>
        <NoteFormMessage state={state} />
      </div>
    </form>
  );
}

function NoteFormMessage({ state }: { state: NoteFormState }) {
  if (state.status === "error" && state.message) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.message}
      </p>
    );
  }
  return null;
}

// The control sits inside the field card, so it drops its own frame
const controlClassName =
  "rounded-none border-0 bg-transparent p-0 placeholder:font-normal dark:bg-transparent";

// Text and date fields shared by the add and edit forms. After an error they
// show what the user typed
function NoteFields({
  idPrefix,
  state,
  defaults,
  today,
}: {
  idPrefix: string;
  state: NoteFormState;
  defaults: { body: string; notedOn: string };
  today: string;
}) {
  const values = state.values ?? defaults;
  const errorFor = (field: NoteField) => state.errors?.[field]?.[0];
  return (
    <>
      <NoteFieldCard
        id={`${idPrefix}-body`}
        label="Текст заметки"
        error={errorFor("body")}
      >
        <Textarea
          id={`${idPrefix}-body`}
          name="body"
          defaultValue={values.body}
          placeholder="О чём говорили, о чём договорились"
          aria-invalid={errorFor("body") ? true : undefined}
          aria-describedby={
            errorFor("body") ? `${idPrefix}-body-error` : undefined
          }
          className={`${controlClassName} min-h-24 font-medium`}
        />
      </NoteFieldCard>
      <NoteFieldCard
        id={`${idPrefix}-date`}
        label="Дата"
        error={errorFor("notedOn")}
      >
        <Input
          id={`${idPrefix}-date`}
          name="notedOn"
          type="date"
          max={today}
          defaultValue={values.notedOn}
          aria-invalid={errorFor("notedOn") ? true : undefined}
          aria-describedby={
            errorFor("notedOn") ? `${idPrefix}-date-error` : undefined
          }
          className={`${controlClassName} h-6 font-semibold`}
        />
      </NoteFieldCard>
    </>
  );
}

// Same field card as in the contact form
function NoteFieldCard({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label
        htmlFor={id}
        className="grid cursor-text gap-1 rounded-xl border-[1.5px] border-border bg-card px-4.5 py-3.5 transition-colors focus-within:border-foreground hover:not-focus-within:border-border-dashed has-aria-invalid:border-destructive"
      >
        <span className="text-[0.8125rem] text-subtle-foreground">{label}</span>
        {children}
      </label>
      {error && (
        <p id={`${id}-error`} className="px-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function DeleteNoteButton({ noteId }: { noteId: number }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 aria-hidden="true" data-icon="inline-start" />
        Удалить
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить заметку?</AlertDialogTitle>
          <AlertDialogDescription>Это нельзя отменить.</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={deleteNoteAction.bind(null, noteId)}>
          <DeleteFooter />
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
