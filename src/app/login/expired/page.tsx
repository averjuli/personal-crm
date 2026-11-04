import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// Where a link that was used, expired or replaced by a newer one leads
export default function LinkExpiredPage() {
  return (
    <div className="grid max-w-md gap-4">
      <h1 className="font-heading text-title font-medium lg:text-title-lg">
        Ссылка устарела, запроси новую
      </h1>
      <Link href="/login" className={`${buttonVariants()} w-fit`}>
        Запросить новую ссылку
      </Link>
    </div>
  );
}
