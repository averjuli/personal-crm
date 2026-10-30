"use client";

import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ContactSearchProps = {
  defaultValue: string;
  groups: { id: number; name: string }[];
  // Selected group; null means "Все группы"
  groupId: number | null;
};

export function ContactSearch({
  defaultValue,
  groups,
  groupId,
}: ContactSearchProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [group, setGroup] = useState(groupId === null ? "" : String(groupId));
  const initialGroup = useRef(group);

  // Picking a group shows its contacts right away, together with the query.
  // Waiting for the effect lets the form see the new value of the field
  useEffect(() => {
    if (group !== initialGroup.current) {
      initialGroup.current = group;
      formRef.current?.requestSubmit();
    }
  }, [group]);

  const items = [
    { value: "", label: "Все группы" },
    ...groups.map(({ id, name }) => ({ value: String(id), label: name })),
  ];

  return (
    <Form
      ref={formRef}
      action="/"
      role="search"
      className="flex flex-wrap gap-2"
    >
      <div className="relative max-w-sm min-w-48 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-subtle-foreground"
        />
        <Input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder="Поиск по имени или группе"
          aria-label="Поиск по имени или группе"
          className="pl-10"
        />
      </div>
      <Select
        name="group"
        value={group}
        onValueChange={(value) => setGroup(value ?? "")}
        items={items}
      >
        <SelectTrigger
          aria-label="Группа"
          className="w-48 rounded-lg border-[1.5px] bg-card px-3.5 text-base data-[size=default]:h-11"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline">
        Найти
      </Button>
      {(defaultValue || groupId !== null) && (
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Сбросить
        </Link>
      )}
    </Form>
  );
}
