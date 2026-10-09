import { BackToList } from "@/components/back-to-list";

export default function NotFound() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Такой страницы нет</h1>
      <p className="text-muted-foreground">
        Возможно, ссылка устарела или в адресе опечатка.
      </p>
      <BackToList />
    </div>
  );
}
