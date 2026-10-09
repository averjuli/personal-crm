"use client";

import { useActionState } from "react";

import {
  createContactAction,
  updateContactAction,
} from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ContactField,
  ContactFormState,
  ContactFormValues,
} from "@/lib/contact-form";

const initialState: ContactFormState = { status: "idle" };

const emptyValues: ContactFormValues = {
  name: "",
  about: "",
  howWeMet: "",
  phone: "",
  email: "",
  notes: "",
};

type ContactFormProps = {
  // Existing contact to edit; omit to create a new one
  contact?: { id: number; values: ContactFormValues };
};

export function ContactForm({ contact }: ContactFormProps) {
  const action = contact
    ? updateContactAction.bind(null, contact.id)
    : createContactAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const values = state.values ?? contact?.values ?? emptyValues;
  const errorFor = (field: ContactField) => state.errors?.[field]?.[0];

  return (
    <form action={formAction} className="grid gap-5" noValidate>
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
      <div className="grid gap-5 sm:grid-cols-2">
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
      <div className="grid gap-2">
        <Label htmlFor="notes">Заметки</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={8}
          defaultValue={values.notes}
          aria-invalid={errorFor("notes") ? true : undefined}
          aria-describedby={errorFor("notes") ? "notes-error" : undefined}
          placeholder="О чём говорили, о чём договорились"
        />
        <FieldError id="notes-error" message={errorFor("notes")} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
      <p aria-live="polite" className="text-sm text-muted-foreground">
        Изменения сохранены в {time}
      </p>
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
  placeholder?: string;
};

function Field({
  name,
  label,
  defaultValue,
  error,
  required,
  type = "text",
  placeholder,
}: FieldProps) {
  const errorId = `${name}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}
