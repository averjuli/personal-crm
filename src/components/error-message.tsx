"use client";

import { RotateCw } from "lucide-react";
import { useEffect } from "react";

import { BackToList } from "@/components/back-to-list";
import { Button } from "@/components/ui/button";

export type ErrorPageProps = {
  // Missing in the 500 page that Next.js prerenders from global-error.tsx
  error?: Error & { digest?: string };
  retry: () => void;
};

// Content of error.tsx and global-error.tsx: a page failed to render, e.g. the database is down
export function ErrorMessage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  return (
    <div className="grid gap-4">
      <h1 className="font-heading text-title font-medium lg:text-title-lg">
        Что-то пошло не так
      </h1>
      <p className="text-muted-foreground">
        Не получилось открыть страницу. Обычно это ненадолго: попробуйте ещё раз.
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <Button onClick={() => retry()}>
          <RotateCw aria-hidden="true" strokeWidth={2.5} data-icon="inline-start" />
          Попробовать ещё раз
        </Button>
        <BackToList />
      </div>
      {error?.digest && (
        // The same code is in the server log: ssh crm sudo crm-deploy logs
        <p className="text-sm text-subtle-foreground">Код ошибки: {error.digest}</p>
      )}
    </div>
  );
}
