import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ContactListItem } from "@/lib/contacts";

export function ContactsTable({ contacts }: { contacts: ContactListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Имя</TableHead>
          <TableHead className="hidden md:table-cell">Кто это</TableHead>
          <TableHead>Телефон</TableHead>
          <TableHead className="hidden lg:table-cell">Почта</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => (
          <TableRow key={contact.id}>
            <TableCell className="font-medium">
              <Link
                href={`/contacts/${contact.id}`}
                className="underline-offset-4 hover:underline"
              >
                {contact.name}
              </Link>
            </TableCell>
            <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
              {contact.about}
            </TableCell>
            <TableCell>{contact.phone}</TableCell>
            <TableCell className="hidden text-muted-foreground lg:table-cell">
              {contact.email}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
