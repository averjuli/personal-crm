import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ContactSearch({ defaultValue }: { defaultValue: string }) {
  return (
    <Form action="/" role="search" className="flex flex-wrap gap-2">
      <div className="relative max-w-sm min-w-48 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-subtle-foreground"
        />
        <Input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Поиск по имени"
          aria-label="Поиск по имени"
          className="pl-10"
        />
      </div>
      <Button type="submit" variant="outline">
        Найти
      </Button>
      {defaultValue && (
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Сбросить
        </Link>
      )}
    </Form>
  );
}
