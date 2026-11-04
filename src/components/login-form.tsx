"use client";

import { useActionState } from "react";

import { requestLinkAction } from "@/app/login/actions";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LoginFormState } from "@/lib/login-form";

const initialState: LoginFormState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    requestLinkAction,
    initialState,
  );
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {state.status === "sent" && (
        <StatusPill role="status">
          Ссылка для входа отправлена на {state.sentTo}
        </StatusPill>
      )}
      <div className="grid gap-1.5">
        <label
          htmlFor="login-email"
          className="text-[0.8125rem] text-subtle-foreground"
        >
          Почта
        </label>
        <Input
          id="login-email"
          // The field is remounted to show what was typed after each answer
          key={`${state.status}|${state.value ?? ""}`}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.value ?? ""}
          placeholder="anna@example.com"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-email-error" : undefined}
        />
        {state.error && (
          <p id="login-email-error" className="px-1 text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Отправляю…" : "Получить ссылку"}
      </Button>
    </form>
  );
}
