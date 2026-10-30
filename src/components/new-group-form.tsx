"use client";

import { useActionState } from "react";

import { createGroupFormAction } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GroupFormState } from "@/lib/group-form";

const initialState: GroupFormState = { status: "idle" };

export function NewGroupForm() {
  const [state, formAction, pending] = useActionState(
    createGroupFormAction,
    initialState,
  );
  return (
    <form action={formAction} className="grid gap-1.5" noValidate>
      <label
        htmlFor="new-group-name"
        className="text-[0.8125rem] text-subtle-foreground"
      >
        Новая группа
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="new-group-name"
          // A new key remounts the field to show what was typed after an error
          key={state.value ?? ""}
          name="name"
          defaultValue={state.value ?? ""}
          placeholder="Например: Теннис"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "new-group-name-error" : undefined}
          className="max-w-xs flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Добавляю…" : "Добавить"}
        </Button>
      </div>
      {state.error && (
        <p id="new-group-name-error" className="px-1 text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
