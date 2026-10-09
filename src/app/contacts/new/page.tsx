import { BackToList } from "@/components/back-to-list";
import { ContactForm } from "@/components/contact-form";

export default function NewContactPage() {
  return (
    <div className="grid max-w-2xl gap-6">
      <BackToList />
      <h1 className="text-2xl font-semibold">Новый контакт</h1>
      <ContactForm />
    </div>
  );
}
