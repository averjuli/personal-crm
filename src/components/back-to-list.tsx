import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackToList() {
  return (
    <Link
      href="/"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Все контакты
    </Link>
  );
}
