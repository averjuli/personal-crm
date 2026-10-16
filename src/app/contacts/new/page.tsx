import { BackToList } from "@/components/back-to-list";
import { ContactForm } from "@/components/contact-form";

export default function NewContactPage() {
  return (
    <div className="grid max-w-2xl gap-6">
      <BackToList />
      <h1 className="font-heading text-title font-medium lg:text-title-lg">
        Новый контакт
      </h1>
      <ContactForm />
    </div>
  );
}
