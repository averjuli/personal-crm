import Link from "next/link";

export function BackToList() {
  return (
    <Link
      href="/"
      className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      ← Все контакты
    </Link>
  );
}
