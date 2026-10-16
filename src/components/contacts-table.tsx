"use client";

import { SoftNavigation } from "@/components/soft-navigation";
import type { ContactListItem } from "@/lib/contacts";
import { initials } from "@/lib/initials";

// A client component on purpose: the server sends the rows as compact data
// instead of a serialized element tree for every cell, which keeps a
// 1000-row page small. Styling lives once in globals.css (.contacts-table).
export function ContactsTable({ contacts }: { contacts: ContactListItem[] }) {
  return (
    <SoftNavigation>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="contacts-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Телефон</th>
              <th>Почта</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td>
                  <div>
                    <span aria-hidden="true">{initials(contact.name)}</span>
                    <div>
                      <a href={`/contacts/${contact.id}`}>{contact.name}</a>
                      {contact.about && <p>{contact.about}</p>}
                    </div>
                  </div>
                </td>
                <td>{contact.phone}</td>
                <td>{contact.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SoftNavigation>
  );
}
