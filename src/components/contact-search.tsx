import Form from "next/form";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ContactSearch({ defaultValue }: { defaultValue: string }) {
  return (
    <Form action="/" role="search" className="flex flex-wrap gap-2">
      <Input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Поиск по имени"
        aria-label="Поиск по имени"
        className="max-w-sm flex-1"
      />
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
