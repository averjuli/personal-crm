import { BackToList } from "@/components/back-to-list";

export default function NotFound() {
  return (
    <div className="grid gap-4">
      <h1 className="font-heading text-title font-medium lg:text-title-lg">
        Такой страницы нет
      </h1>
      <p className="text-muted-foreground">
        Возможно, ссылка устарела или в адресе опечатка.
      </p>
      <BackToList />
    </div>
  );
}
