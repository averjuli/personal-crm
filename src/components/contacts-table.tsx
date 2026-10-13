"use client";

import { SoftNavigation } from "@/components/soft-navigation";
import type { ContactListItem } from "@/lib/contacts";

// A client component on purpose: the server sends the rows as compact data
// instead of a serialized element tree for every cell, which keeps a
// 1000-row page small. Styling lives once in globals.css (.contacts-table).
export function ContactsTable({ contacts }: { contacts: ContactListItem[] }) {
  return (
    <SoftNavigation>
      <table className="contacts-table">
        <thead>
          <tr>
            <th>Имя</th>
            <th>Кто это</th>
            <th>Телефон</th>
            <th>Почта</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr key={contact.id}>
              <td>
                <a href={`/contacts/${contact.id}`}>{contact.name}</a>
              </td>
              <td>{contact.about}</td>
              <td>{contact.phone}</td>
              <td>{contact.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SoftNavigation>
  );
}
