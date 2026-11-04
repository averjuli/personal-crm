import { BackToList } from "@/components/back-to-list";

// The same page for a contact that does not exist and for a contact of
// someone else: it must not tell them apart
export default function ContactNotFound() {
  return (
    <div className="grid gap-4">
      <h1 className="font-heading text-title font-medium lg:text-title-lg">
        Контакт не найден
      </h1>
      <BackToList />
    </div>
  );
}
