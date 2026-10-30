"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  createContactAction,
  updateContactAction,
} from "@/app/contacts/actions";
import { addGroupAction } from "@/app/groups/actions";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ContactField,
  ContactFormState,
  ContactFormValues,
} from "@/lib/contact-form";
import { frequencyLabels } from "@/lib/keep-in-touch";

const initialState: ContactFormState = { status: "idle" };

const emptyValues: ContactFormValues = {
  name: "",
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
  frequency: "",
  note: "",
  groupIds: [],
};

const frequencyItems = [
  { value: "", label: "Не задано" },
  ...Object.entries(frequencyLabels).map(([value, label]) => ({
    value,
    label,
  })),
];

type GroupOption = { id: number; name: string };

type ContactFormProps = {
  // Every existing group, alphabetically
  groups: GroupOption[];
  // Existing contact to edit; omit to create a new one
  contact?: {
    id: number;
    values: ContactFormValues;
    // Ready-made lines under the frequency field: last communication, due day
    keepInTouchLines: string[];
  };
};

export function ContactForm({ groups, contact }: ContactFormProps) {
  const action = contact
    ? updateContactAction.bind(null, contact.id)
    : createContactAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const values = state.values ?? contact?.values ?? emptyValues;
  const errorFor = (field: ContactField) => state.errors?.[field]?.[0];

  return (
    <form action={formAction} className="grid gap-2.5" noValidate>
      <Field
        name="name"
        label="Имя"
        required
        defaultValue={values.name}
        error={errorFor("name")}
        placeholder="Например: Анна Смирнова"
      />
      <Field
        name="about"
        label="Кто это"
        defaultValue={values.about}
        error={errorFor("about")}
        placeholder="Например: коллега по прошлой работе"
      />
      <Field
        name="howWeMet"
        label="Откуда знакомы"
        defaultValue={values.howWeMet}
        error={errorFor("howWeMet")}
        placeholder="Например: курсы английского, 2023"
      />
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field
          name="phone"
          label="Телефон"
          type="tel"
          defaultValue={values.phone}
          error={errorFor("phone")}
          placeholder="+7 (900) 123-45-67"
        />
        <Field
          name="email"
          label="Почта"
          type="email"
          defaultValue={values.email}
          error={errorFor("email")}
          placeholder="anna@example.com"
        />
      </div>
      <FrequencyField
        defaultValue={values.frequency}
        error={errorFor("frequency")}
        lines={contact?.keepInTouchLines}
      />
      <GroupsField
        groups={groups}
        defaultIds={values.groupIds.map(Number)}
        // A new state object after every submit
        submitState={state}
      />
      {/* Notes of an existing contact live in their own block on the card */}
      {!contact && (
        <Field
          name="note"
          label="Заметка"
          multiline
          defaultValue={values.note}
          error={errorFor("note")}
          placeholder="О чём говорили, о чём договорились"
        />
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : contact ? "Сохранить" : "Добавить контакт"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

function FormStatus({ state }: { state: ContactFormState }) {
  if (state.status === "error" && state.message) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.message}
      </p>
    );
  }
  if (state.status === "saved" && state.savedAt) {
    const time = new Date(state.savedAt).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <StatusPill aria-live="polite">Изменения сохранены в {time}</StatusPill>
    );
  }
  return null;
}

type FieldProps = {
  name: ContactField;
  label: string;
  defaultValue: string;
  error?: string;
  required?: boolean;
  type?: "text" | "tel" | "email";
  // Multi-line text area instead of a single-line input
  multiline?: boolean;
  placeholder?: string;
};

// The control sits inside the field card, so it drops its own frame
const controlClassName =
  "rounded-none border-0 bg-transparent p-0 placeholder:font-normal dark:bg-transparent";

// Field card from the landing's first screen: small label on top, value below,
// ink outline on the field being edited. The whole card is the label, so a
// click anywhere on it focuses the control.
function Field({
  name,
  label,
  defaultValue,
  error,
  required,
  type = "text",
  multiline,
  placeholder,
}: FieldProps) {
  const errorId = `${name}-error`;
  const controlProps = {
    id: name,
    name,
    defaultValue,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  };
  return (
    <div className="grid content-start gap-1.5">
      <label
        htmlFor={name}
        className="grid cursor-text gap-1 rounded-xl border-[1.5px] border-border bg-card px-4.5 py-3.5 transition-colors focus-within:border-foreground hover:not-focus-within:border-border-dashed has-aria-invalid:border-destructive"
      >
        <span className="text-[0.8125rem] text-subtle-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
        {multiline ? (
          <Textarea
            {...controlProps}
            className={`${controlClassName} min-h-36 font-medium`}
          />
        ) : (
          <Input
            {...controlProps}
            type={type}
            required={required}
            className={`${controlClassName} h-6 font-semibold`}
          />
        )}
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function FrequencyField({
  defaultValue,
  error,
  lines,
}: {
  defaultValue: string;
  error?: string;
  lines?: string[];
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label
        htmlFor="frequency"
        className="grid cursor-pointer gap-1 rounded-xl border-[1.5px] border-border bg-card px-4.5 py-3.5 transition-colors focus-within:border-foreground hover:not-focus-within:border-border-dashed has-aria-invalid:border-destructive"
      >
        <span className="text-[0.8125rem] text-subtle-foreground">
          Как часто общаться
        </span>
        <Select
          name="frequency"
          defaultValue={defaultValue}
          items={frequencyItems}
        >
          <SelectTrigger
            id="frequency"
            aria-invalid={error ? true : undefined}
            className="h-6 w-full rounded-none border-0 bg-transparent p-0 font-semibold focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {frequencyItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {lines?.map((line) => (
        <p key={line} className="px-1 text-sm text-muted-foreground">
          {line}
        </p>
      ))}
      <FieldError id="frequency-error" message={error} />
    </div>
  );
}

// Checkboxes for the existing groups and a small form to add a new one. The
// new group is created at once and checked; "Сохранить" then sends only ids of
// existing groups. The input has no name, so it is not part of the contact
function GroupsField({
  groups,
  defaultIds,
  submitState,
}: {
  groups: GroupOption[];
  defaultIds: number[];
  submitState: ContactFormState;
}) {
  const [checked, setChecked] = useState(() => new Set(defaultIds));
  // Groups added here that the page props do not carry yet
  const [added, setAdded] = useState<GroupOption[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string>();
  const [adding, startAdding] = useTransition();
  const boxesRef = useRef<HTMLDivElement>(null);

  // React resets the form after every submit, which unchecks the boxes on the
  // screen while the state still holds the choice. Put the screen back in line
  // with the state
  useEffect(() => {
    boxesRef.current
      ?.querySelectorAll<HTMLInputElement>("input[name=groupIds]")
      .forEach((box) => {
        box.checked = checked.has(Number(box.value));
      });
  }, [submitState, checked]);

  const all = [
    ...groups,
    ...added.filter((group) => !groups.some((known) => known.id === group.id)),
  ].sort((a, b) => a.name.localeCompare(b.name, "ru"));

  function toggle(id: number) {
    setChecked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  function addGroup() {
    startAdding(async () => {
      const result = await addGroupAction(newName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setNewName("");
      setAdded((current) => [...current, result.group]);
      setChecked((current) => new Set(current).add(result.group.id));
    });
  }

  return (
    <div
      ref={boxesRef}
      role="group"
      aria-labelledby="groups-label"
      className="grid content-start gap-3 rounded-xl border-[1.5px] border-border bg-card px-4.5 py-3.5"
    >
      <span
        id="groups-label"
        className="text-[0.8125rem] text-subtle-foreground"
      >
        Группы
      </span>
      {all.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {all.map((group) => (
            <li key={group.id}>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-[1.5px] border-border px-3 py-1.5 text-sm font-semibold transition-colors hover:border-border-dashed has-checked:border-foreground has-checked:bg-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-focus-visible:outline-solid">
                <input
                  type="checkbox"
                  name="groupIds"
                  value={group.id}
                  checked={checked.has(group.id)}
                  onChange={() => toggle(group.id)}
                  className="size-4 accent-foreground"
                />
                <span className="break-words">{group.name}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Групп пока нет</p>
      )}
      <div className="grid gap-1.5">
        <label
          htmlFor="new-group"
          className="text-[0.8125rem] text-subtle-foreground"
        >
          Новая группа
        </label>
        <div className="flex gap-2">
          <Input
            id="new-group"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            // Enter adds the group instead of submitting the whole contact
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!adding) {
                  addGroup();
                }
              }
            }}
            placeholder="Например: Теннис"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "new-group-error" : undefined}
            className="max-w-xs"
          />
          <Button
            type="button"
            variant="outline"
            disabled={adding}
            onClick={addGroup}
          >
            {adding ? "Добавляю…" : "Добавить"}
          </Button>
        </div>
        <FieldError id="new-group-error" message={error} />
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="px-1 text-sm text-destructive">
      {message}
    </p>
  );
}
