"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  markContactedAction,
  skipContactAction,
  undoKeepInTouchAction,
} from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import type {
  KeepInTouchChange,
  KeepInTouchKind,
  OverdueContact,
} from "@/lib/contacts";
import { formatOverdue, frequencyLabels } from "@/lib/keep-in-touch";

// How long the "Cancel" row stays in place of the contact
const UNDO_MS = 5000;

type UndoRow = {
  contact: OverdueContact;
  kind: KeepInTouchKind;
  change: KeepInTouchChange;
  // Place in the list at the time of the click
  index: number;
};

export function OverdueContacts({ contacts }: { contacts: OverdueContact[] }) {
  const [undoRows, setUndoRows] = useState<UndoRow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  function dropUndoRow(contactId: number) {
    clearTimeout(timers.current.get(contactId));
    timers.current.delete(contactId);
    setUndoRows((rows) => rows.filter((row) => row.contact.id !== contactId));
  }

  function mark(contact: OverdueContact, index: number, kind: KeepInTouchKind) {
    setError(null);
    setBusyId(contact.id);
    startTransition(async () => {
      const action =
        kind === "contacted" ? markContactedAction : skipContactAction;
      const result = await action(contact.id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setUndoRows((rows) => [
        ...rows,
        { contact, kind, change: result.change, index },
      ]);
      timers.current.set(
        contact.id,
        setTimeout(() => dropUndoRow(contact.id), UNDO_MS),
      );
    });
  }

  function undo(row: UndoRow) {
    setError(null);
    dropUndoRow(row.contact.id);
    startTransition(async () => {
      await undoKeepInTouchAction(row.contact.id, row.kind, row.change);
    });
  }

  // The server list no longer has contacts that were just marked; their
  // "Cancel" rows go back to the places they had
  const undoIds = new Set(undoRows.map((row) => row.contact.id));
  const rows: Array<
    | { type: "contact"; contact: OverdueContact; index: number }
    | { type: "undo"; row: UndoRow }
  > = contacts
    .filter((contact) => !undoIds.has(contact.id))
    .map((contact, index) => ({ type: "contact", contact, index }));
  [...undoRows]
    .sort((a, b) => a.index - b.index)
    .forEach((row) => {
      rows.splice(Math.min(row.index, rows.length), 0, { type: "undo", row });
    });

  return (
    <section aria-labelledby="overdue-heading" className="grid gap-3">
      <h2 id="overdue-heading" className="font-heading text-xl font-medium">
        Пора связаться
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Со всеми на связи</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border bg-card">
          {rows.map((item) =>
            item.type === "contact" ? (
              <OverdueRow
                key={item.contact.id}
                contact={item.contact}
                busy={busyId === item.contact.id}
                onMark={(kind) => mark(item.contact, item.index, kind)}
              />
            ) : (
              <UndoItem
                key={item.row.contact.id}
                row={item.row}
                onUndo={() => undo(item.row)}
              />
            ),
          )}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

const rowClassName =
  "flex min-h-[4.25rem] items-center justify-between gap-3 border-b px-4 py-2 last:border-b-0 md:px-5";

function OverdueRow({
  contact,
  busy,
  onMark,
}: {
  contact: OverdueContact;
  busy: boolean;
  onMark: (kind: KeepInTouchKind) => void;
}) {
  return (
    <li className={rowClassName}>
      <div className="min-w-0">
        <Link
          href={`/contacts/${contact.id}`}
          className="font-semibold break-words underline-offset-4 hover:underline"
        >
          {contact.name}
        </Link>
        <p className="text-[0.8125rem] leading-snug text-muted-foreground">
          {contact.frequency && frequencyLabels[contact.frequency]} ·{" "}
          {formatOverdue(contact.overdueDays)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <IconButton
          label="Уже связался"
          disabled={busy}
          onClick={() => onMark("contacted")}
        >
          <Check aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Пропустить этот раз"
          disabled={busy}
          onClick={() => onMark("skipped")}
        >
          <X aria-hidden="true" />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="size-11 p-0"
    >
      {children}
    </Button>
  );
}

function UndoItem({ row, onUndo }: { row: UndoRow; onUndo: () => void }) {
  return (
    <li className={rowClassName}>
      <p className="min-w-0 break-words" role="status">
        {row.kind === "contacted" ? "Отметили" : "Пропустили"}:{" "}
        <span className="font-semibold">{row.contact.name}</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onUndo}>
        Отменить
      </Button>
    </li>
  );
}
